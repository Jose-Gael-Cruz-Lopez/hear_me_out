/** Original vector editorial covers. Keep accurate event details in HTML, never in generated pixels. */
export function PlanCoverArt({ category, title }: { category: string; title: string }) {
  const clues = `${category} ${title}`;
  const kind = /movie|cinema|film|theat(?:er|re)/i.test(category) ? 'movie'
    : /activity|board.?game|bowling|arcade|karaoke|music|concert|park\b|outdoor|hiking|museum|gallery/i.test(clues) ? 'activity'
    : /cafe|café|coffee/i.test(clues) ? 'coffee' : /ramen|noodle/i.test(clues) ? 'noodles' : 'food';
  const blue = '#2649a3', paper = '#f8f3e8', red = '#c34c36', ink = '#202923';
  return <svg viewBox="0 0 480 360" fill="none" aria-hidden="true" focusable="false" className="event-cover-art" data-kind={kind}>
    <rect width="480" height="360" fill={kind === 'movie' ? blue : paper} />
    {/* A little place-setting, not a giant decorative shape covering the whole invitation. */}
    {kind === 'food' || kind === 'noodles' ? <>
      <path d="M38 52h118l-12 280H26Z" fill={blue} />
      <path d="m46 65 94 250M67 55l82 221M33 140l83 182" stroke="#f8f3e8" strokeWidth="2" opacity=".5" />
      <ellipse cx="263" cy="215" rx="137" ry="112" fill="#e7dfcf" />
      <ellipse cx="256" cy="204" rx="137" ry="112" fill={paper} stroke={blue} strokeWidth="3" />
      <ellipse cx="256" cy="204" rx="108" ry="86" stroke={blue} strokeWidth="1.5" />
      {kind === 'noodles' ? <g stroke={red} strokeWidth="5" strokeLinecap="round">
        <path d="M192 192c-20-39 75-54 49-10s67 45 64 5-77-49-53-7 62 52 76 16M187 215c-3 40 90 40 88 5s-79-35-65 0 71 28 96 6M217 165c-27-2-48 13-43 38m139-37c24 12 31 32 14 46" />
        <path d="m326 80 64-48m-55 62 64-48" stroke={ink} strokeWidth="5" />
      </g> : <>
        {['translate(220 177) rotate(-18)', 'translate(283 184) rotate(14)', 'translate(251 241) rotate(-8)'].map(transform => <g key={transform} transform={transform}>
          <rect x="-27" y="-27" width="54" height="54" rx="7" fill="#eac85e" stroke={ink} strokeWidth="1.5" />
          <rect x="-21" y="-21" width="42" height="42" rx="6" stroke={ink} strokeWidth="1" strokeDasharray="1 4" strokeLinecap="round" />
          <ellipse rx="12" ry="10" fill="#d7ae44" />
          <path d="m-4-5 9 10m-9 0 9-10" stroke={red} strokeWidth="2" strokeLinecap="round" />
        </g>)}
        <path d="m297 245 9-14m-8 14 16-2m-16 1 1-15" stroke="#59734b" strokeWidth="3" strokeLinecap="round" />
        <path d="M419 85v47m-12-47v35q0 17 12 17t12-17V85m-12 51-5 140" stroke={ink} strokeWidth="5" strokeLinecap="round" />
      </>}
      <path d="M368 265a33 33 0 0 1 46 46Z" fill="#eac85e" stroke={ink} strokeWidth="2" />
      <path d="m374 274 31 29m-24-33 24 26" stroke={paper} strokeWidth="2" />
    </> : kind === 'coffee' ? <>
      <path d="m40 58 140-22 49 291-140 22Z" fill={blue} />
      <path d="m65 58 47 272m-24-277 46 275m-24-280 46 276" stroke={paper} strokeWidth="2" opacity=".5" />
      <ellipse cx="285" cy="246" rx="112" ry="69" fill="#e7dfcf" />
      <ellipse cx="278" cy="234" rx="112" ry="69" fill={paper} stroke={red} strokeWidth="3" />
      <path d="M344 136h18c47 0 46 70 0 70h-18" stroke={red} strokeWidth="13" />
      <path d="m195 134 12 86c4 38 121 38 126 0l13-86" fill={paper} stroke={red} strokeWidth="3" />
      <ellipse cx="270" cy="134" rx="75" ry="40" fill={red} />
      <ellipse cx="270" cy="133" rx="61" ry="29" fill="#483529" />
      <path d="M234 131c8-28 66-29 73 0-20 27-46 28-73 0Z" fill={paper} />
      <path d="m257 122 14 29m12-29-13 28" stroke="#483529" strokeWidth="2" />
      <path d="m365 290 52-9m-51 16 52-9" stroke={ink} strokeWidth="5" strokeLinecap="round" />
    </> : kind === 'movie' ? <>
      <path d="m68 84 305-32 26 233-305 32Z" fill={paper} />
      <path d="m96 109 251-27 15 147-251 26Z" fill={red} />
      <path d="m181 150 76 27-68 42Z" fill={paper} />
      <path d="m120 281 233-25" stroke={blue} strokeWidth="3" strokeDasharray="8 8" />
      <path d="m353 251 26 69-70 9-18-67" fill="#eac85e" stroke={blue} strokeWidth="3" />
      <path d="m314 266 12 50m9-51 12 49m7-48 12 46" stroke={red} strokeWidth="7" />
      <path d="M301 258c-13-30 3-43 16-30 6-31 28-29 32-8 20-19 38 2 25 23 20 5 17 24 3 23Z" fill={paper} stroke={blue} strokeWidth="2" />
    </> : <>
      <path d="m66 127 230-81 119 182-230 81Z" fill="#d7dfc5" stroke={ink} strokeWidth="2" />
      <path d="m99 134 27 42 37-13 26 41 37-13 27 42 37-13 26 41M158 111l27 42 37-13 27 41 37-13 26 42 37-13 26 41M218 90l27 42 37-13 27 41 37-13 26 42" stroke={paper} strokeWidth="12" />
      <path d="m168 219 52-19 39 50-52 19Z" fill={red} stroke={ink} strokeWidth="2" />
      <path d="m168 219 5 36 36 35 50-18v-22l-52 19Z" fill={red} stroke={ink} strokeWidth="2" />
      <circle cx="201" cy="232" r="4" fill={paper} /><circle cx="222" cy="237" r="4" fill={paper} />
      <path d="M291 133c-22-3-29 33-9 39l-15 42c14 12 47 8 56-5l-23-38c18-14 12-37-9-38Z" fill={blue} stroke={ink} strokeWidth="2" />
    </>}
  </svg>;
}
