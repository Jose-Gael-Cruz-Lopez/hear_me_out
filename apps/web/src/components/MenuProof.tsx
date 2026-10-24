// Menu check: proof from a finalist's own website (Apify Website Content Crawler) that it serves the
// diets someone in the room asked for, with the real dishes it found.
import { useRoom } from '../lib/room';
import { IconText } from './Ink';

const DIET_LABEL: Record<string, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'gluten-free': 'Gluten-free',
  halal: 'Halal',
  kosher: 'Kosher',
  'dairy-free': 'Dairy-free',
  'nut-free': 'Nut-free',
  pescatarian: 'Pescatarian',
};
const label = (d: string) => DIET_LABEL[d] ?? d;
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** `linked` is false when the card is itself a button (an anchor can't sit inside one). */
export function MenuProof({ optionId, linked = true, big = false }: { optionId: bigint; linked?: boolean; big?: boolean }) {
  const { menuProofs } = useRoom();
  const m = menuProofs.get(optionId);
  if (!m) return null;
  const diets = m.diets.map(label).join(' + ');
  const source = m.sourceUrl ? (
    linked ? (
      <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="menu-proof-src">
        {host(m.sourceUrl)}
      </a>
    ) : (
      <span className="menu-proof-src">{host(m.sourceUrl)}</span>
    )
  ) : null;

  if (m.status === 'checking') {
    return (
      <div className="menu-proof checking">
        <IconText text="📋 " />
        <span className="animate-pulse">Reading their menu for {diets.toLowerCase()} dishes…</span>
      </div>
    );
  }
  if (m.status === 'confirmed') {
    return (
      <div className={`menu-proof confirmed ${big ? 'big' : ''}`}>
        <div className="menu-proof-head">
          <IconText text="📋 " />
          Menu checked · {diets} ✓ {source && <>· {source}</>}
        </div>
        <ul>
          {m.dishes.map((d, i) => (
            <li key={i}>
              {m.diets.length > 1 && <b>{label(d.diet)}: </b>}“{d.dish}”
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const text =
    m.status === 'not_found'
      ? `Checked their website: no ${diets.toLowerCase()} dishes listed. Ask before you go.`
      : m.status === 'no_website'
        ? 'No website to check the menu.'
        : 'Menu not checked (needs live Apify).';
  return (
    <div className={`menu-proof ${m.status}`}>
      <IconText text="📋 " />
      {text} {m.status === 'not_found' && source}
    </div>
  );
}
