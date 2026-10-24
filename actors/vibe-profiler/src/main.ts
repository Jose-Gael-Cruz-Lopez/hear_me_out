/**
 * Apify actor entry point: a thin wrapper around `profileHandles` from `core.ts`.
 * Dataset: one item per handle (derived fields only, unless `includePosts`). OUTPUT: merged profile.
 */
import { Actor, log } from 'apify';
import { createApifyCallActor } from './apify-call.js';
import { DEFAULT_MUSE_MODEL, profileHandles, resolveTargets, toPublicMerged, toPublicProfile, type LogFn, type ProfilerInput } from './core.js';
import { createMuseTagger } from './muse.js';

interface ActorInput extends ProfilerInput {
  includePosts?: boolean;
  deleteScrapedData?: boolean;
  museApiKey?: string;
  museModel?: string;
}

const logFn: LogFn = (level, message, data) => (level === 'warn' ? log.warning(message, data) : log.info(message, data));

await Actor.init();

const input: ActorInput = (await Actor.getInput<ActorInput>()) ?? {};
const { targets } = resolveTargets(input);
if (targets.length === 0) {
  await Actor.fail('Add at least one Instagram handle, TikTok handle or Facebook page URL (only accounts you own or may analyze).');
} else {
  const deleteScrapedData = input.deleteScrapedData ?? true;
  const museKey = input.museApiKey?.trim();
  log.info('Profiling handles', {
    handles: targets.map(t => `${t.platform}:${t.handle}`),
    postsPerProfile: input.postsPerProfile,
    muse: museKey ? input.museModel || DEFAULT_MUSE_MODEL : 'off (heuristic tags)',
    deleteScrapedData,
  });
  await Actor.setStatusMessage(`Scraping ${targets.length} profile(s)...`);

  const callActor = createApifyCallActor(Actor.apifyClient, {
    deleteScrapedData,
    log: logFn,
    onRun: r => log.info('Scraper run finished', { ...r }),
  });
  const muse = museKey ? createMuseTagger({ apiKey: museKey, model: input.museModel || DEFAULT_MUSE_MODEL, log: logFn }) : undefined;

  const result = await profileHandles(input, { callActor, muse, log: logFn });

  await Actor.pushData(result.profiles.map(p => toPublicProfile(p, input.includePosts === true)));
  await Actor.setValue('OUTPUT', {
    ...toPublicMerged(result.merged, input.includePosts === true),
    generatedAt: new Date().toISOString(),
    privacy: {
      rawPostTextStored: input.includePosts === true,
      scraperDatasetsDeleted: deleteScrapedData,
    },
  });

  const ok = result.profiles.filter(p => p.status === 'ok');
  for (const w of result.warnings) log.warning(w);
  const summary = `Profiled ${ok.length}/${result.profiles.length} handle(s) from ${result.merged.postCount} posts. Tags: ${
    result.merged.tags.join(', ') || 'none'
  } (${result.merged.vibeTagsSource}).`;

  if (result.profiles.every(p => p.status === 'error')) {
    await Actor.fail(`Every scraper call failed. ${result.warnings.join(' | ').slice(0, 500)}`);
  } else {
    await Actor.exit(summary);
  }
}
