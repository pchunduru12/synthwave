import { OpenAI } from 'openai';
import { env } from '../config/env.js';
import { CreationInput, PromptPackage } from '../domain/types.js';

type AudioProvider = 'suno' | 'minimax';

function openAiClient() {
  if (!env.openAiApiKey) return null;
  return new OpenAI({ apiKey: env.openAiApiKey });
}

const DEVOTIONAL_PATTERNS = [
  /radha/i,
  /krishna/i,
  /radhakrishna/i,
  /bhakti/i,
  /bhajan/i,
  /aarti/i,
  /devotional/i,
  /sai/i,
  /baba/i,
  /shirdi/i,
  /ram/i,
  /shiv/i,
  /ganesh/i,
  /govind/i,
  /murli/i,
];

const NATURE_PATTERNS = [/rain/i, /garden/i, /moon/i, /sunrise/i, /spring/i, /forest/i, /flower/i, /river/i];
const FESTIVAL_PATTERNS = [/festival/i, /diwali/i, /holi/i, /celebration/i, /wedding/i, /birthday/i];
const ROMANTIC_PATTERNS = [/love/i, /romantic/i, /heart/i, /beloved/i, /kiss/i];

// Languages that already use Latin script — no romanization needed for video overlay.
const LATIN_SCRIPT_LANGUAGES = new Set([
  'English', 'French', 'Spanish', 'Portuguese', 'Italian', 'German', 'Dutch',
  'Indonesian', 'Malay', 'Vietnamese', 'Turkish', 'Filipino', 'Tagalog', 'Swahili',
]);

function needsRomanization(language: string): boolean {
  return !LATIN_SCRIPT_LANGUAGES.has(language);
}

function resolveAudioProvider(input: CreationInput): AudioProvider {
  const provider = input.audioProvider || env.audioProvider || 'suno';
  return provider === 'minimax' ? 'minimax' : 'suno';
}

export type PromptPackageUsage = {
  provider: 'openai';
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type PromptPackageResult = {
  promptPackage: PromptPackage;
  usage?: PromptPackageUsage;
};

export async function buildPromptPackage(input: CreationInput): Promise<PromptPackage> {
  const result = await buildPromptPackageWithUsage(input);
  return result.promptPackage;
}

export async function buildPromptPackageWithUsage(input: CreationInput): Promise<PromptPackageResult> {
  const heuristic = buildHeuristicPromptPackage(input);
  const client = openAiClient();

  if (!client || env.enableMockProviders) {
    return { promptPackage: heuristic };
  }

  try {
    const response = await client.responses.create({
      model: env.openAiTextModel,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: buildSystemPrompt(input),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                theme: input.theme,
                genre: input.genre,
                language: input.language,
                vocalist: input.vocalist,
                mood: input.mood,
                tempo: input.tempo,
                duration: input.duration,
                audioProvider: resolveAudioProvider(input),
                customPrompt: input.customPrompt || '',
                mode: input.mode,
              }),
            },
          ],
        },
      ],
    });

    const usage = extractPromptUsage(response, env.openAiTextModel);
    const parsed = safeParsePromptPackage(response.output_text);
    if (parsed?.title && parsed?.sunoPrompt && parsed?.imagePrompt && parsed?.lyrics) {
      return {
        promptPackage: {
          detectedIntent: parsed.detectedIntent || heuristic.detectedIntent,
          subject: parsed.subject || heuristic.subject,
          styleNotes: Array.isArray(parsed.styleNotes) ? parsed.styleNotes : heuristic.styleNotes,
          title: parsed.title,
          artistPersona: parsed.artistPersona || heuristic.artistPersona,
          sunoPrompt: parsed.sunoPrompt,
          imagePrompt: parsed.imagePrompt,
          // Optional new fields. If the model omitted them, fall back to heuristic
          // defaults so downstream code can rely on them.
          imageEditPrompt: parsed.imageEditPrompt || heuristic.imageEditPrompt,
          lyrics: parsed.lyrics,
          lyricsRomanized: parsed.lyricsRomanized || heuristic.lyricsRomanized,
        },
        usage,
      };
    }

    console.warn('OpenAI prompt package parse fallback used');
    return { promptPackage: heuristic, usage };
  } catch (error) {
    console.error('OpenAI prompt generation failed:', error);
  }

  return { promptPackage: heuristic };
}

function extractPromptUsage(response: any, model: string): PromptPackageUsage {
  const usage = response?.usage || {};

  const inputTokens = Number(
    usage.input_tokens ??
      usage.inputTokens ??
      usage.prompt_tokens ??
      usage.promptTokens ??
      0,
  );

  const outputTokens = Number(
    usage.output_tokens ??
      usage.outputTokens ??
      usage.completion_tokens ??
      usage.completionTokens ??
      0,
  );

  const totalTokens = Number(
    usage.total_tokens ??
      usage.totalTokens ??
      inputTokens + outputTokens,
  );

  return {
    provider: 'openai',
    model,
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function getDurationStructure(duration: number, provider: AudioProvider): { words: number; structure: string } {
  // Provider-aware lyric budgets.
  //
  // Suno custom_generate receives exact lyrics, then audio-service trims the raw
  // Suno output to the requested duration. For Suno, shorter lyrics prevent the
  // trimmed clip from cutting mid-thought and keep vocals near the beginning.
  //
  // MiniMax returns a more natural complete song and is intentionally NOT
  // trimmed in audio-service. For MiniMax, we allow a larger lyric budget so the
  // generated song has a real verse/chorus arc instead of a compressed jingle.
  //
  // Keep section tags bare. Suno rejects annotated tags like [verse: 20 seconds]
  // and terminator tags like [END].
  if (provider === 'minimax') {
    if (duration <= 30) {
      return {
        words: 70,
        structure: 'Use [verse], [chorus], [verse], [chorus]. Make it feel like a complete short song, not a two-line jingle.',
      };
    }
    if (duration <= 60) {
      return {
        words: 100,
        structure: 'Use [verse], [chorus], [verse], [chorus], [outro]. Give it a natural emotional arc.',
      };
    }
    if (duration <= 120) {
      return {
        words: 150,
        structure: 'Use [verse], [chorus], [verse], [bridge], [chorus], [outro]. Full song progression.',
      };
    }
    if (duration <= 180) {
      return {
        words: 220,
        structure: 'Use [verse], [chorus], [verse], [bridge], [chorus], [chorus], [outro]. Full song with a clear lift.',
      };
    }
    return {
      words: 280,
      structure: 'Use full song structure with [verse], [chorus], [verse], [bridge], [chorus], [outro].',
    };
  }

  if (duration <= 30) {
    return {
      words: 15,
      structure: 'Use [chorus] tag, then 2 short lines (~6-8 words each). No verses, no intro. Vocals from second 1.',
    };
  }
  if (duration <= 60) {
    return {
      words: 30,
      structure: 'Use [verse] tag with 3 short lines, then [chorus] tag with 3 short lines. Vocals enter within 2 seconds.',
    };
  }
  if (duration <= 90) {
    return {
      words: 50,
      structure: 'Use [verse], [chorus], [verse] tags. Compact arrangement, no bridge.',
    };
  }
  if (duration <= 120) {
    return {
      words: 75,
      structure: 'Use [verse], [chorus], [verse], [chorus] tags.',
    };
  }
  if (duration <= 180) {
    return {
      words: 110,
      structure: 'Use [verse], [chorus], [verse], [bridge], [chorus] tags.',
    };
  }
  return {
    words: 180,
    structure: 'Full song structure with [verse], [chorus], [bridge], [outro] tags.',
  };
}

function getLanguageRules(language: string): string {
  // Stub — left intact from the original file. Add more language-specific rules
  // here if needed.
  if (language === 'Hindi') {
    return `
For Hindi requests:
- title must be fully in Hindi using Devanagari script.
- lyrics must be fully in Hindi using Devanagari script.
- do not output English lyrics.
- do not output Hinglish unless explicitly requested.
`;
  }
  return '';
}

function buildProviderDurationRules(provider: AudioProvider): string {
  if (provider === 'minimax') {
    return `
- Audio provider: MiniMax.
- MiniMax is allowed to create a longer, more complete natural song than Suno.
- Do NOT over-compress the lyrics. Use the full word budget when it helps the song feel complete.
- A MiniMax song may naturally run longer than the requested duration because audio-service does not trim MiniMax output.
- Do not exceed the target word count by more than about 10%.
`;
  }

  return `
- Audio provider: Suno.
- Suno raw output is trimmed later to the requested duration, so lyrics must be very concise.
- Suno renders roughly 6 seconds of audio per word of lyrics, so word count is the primary lever for matching the requested duration.
- Do NOT exceed this word count. Shorter is better than longer.
`;
}

function buildSystemPrompt(input: CreationInput) {
  const languageRules = getLanguageRules(input.language);
  const audioProvider = resolveAudioProvider(input);
  const durationGuide = getDurationStructure(input.duration, audioProvider);
  const providerDurationRules = buildProviderDurationRules(audioProvider);
  const devotionalBias =
    input.language === 'Hindi'
      ? `
If the request is devotional, prefer bhajan-like Hindi with reverent spiritual phrasing.
For Radha Krishna songs, center the lyrics on Radha Krishna bhakti, divine love, grace, murli, prem, and devotion.
Avoid generic Western romantic pop lyrics when the user asks for devotional or bhakti content.
`
      : `
If the request is devotional, prioritize devotion and reverence over generic romance.
`;

  // Romanization rules — only applied when the song language uses non-Latin script.
  const romanizationRules = needsRomanization(input.language)
    ? `
Romanization (CRITICAL — controls singalong overlay on the music video):
- Output a "lyricsRomanized" field containing the lyrics transliterated to Latin
  script in the popular "Bollywood subtitles" style. Examples:
    "राधा कृष्ण" → "Radha Krishna"
    "तुम्हारी ज्योति" → "tumhari jyoti"
    "मन के सब सूने कोने" → "man ke sab soone kone"
- Use plain ASCII Latin letters. NO diacritics. NO ITRANS. NO IAST. NO academic notation.
- A native Hindi speaker should be able to read the romanization aloud and
  produce the original sounds. An English speaker should be able to sing along
  phonetically.
- Preserve the SAME line breaks and section markers ([verse], [chorus], etc.)
  as the original lyrics, so timing alignment downstream stays trivial.
- This is a singalong aid, not a translation. Do NOT translate meaning.
`
    : `
Romanization:
- This song's language uses Latin script. Set "lyricsRomanized" to null.
`;

  return `
You are an expert songwriter and creative director for a music generation app.

Return STRICT JSON only.
Do not wrap in markdown.
Do not add commentary.

JSON keys:
- title
- artistPersona
- detectedIntent
- subject
- styleNotes
- sunoPrompt
- imagePrompt
- imageEditPrompt
- lyrics
- lyricsRomanized

Rules:
- The customPrompt has higher priority than the generic theme.
- detectedIntent must be one of: devotional, nature, festival, romantic, general.
- styleNotes must be an array of short strings.
- sunoPrompt must be in ENGLISH because downstream music models follow English production instructions better.
- imagePrompt must be in ENGLISH because downstream image models follow English visual instructions better.
- imagePrompt is for the "generate cover art from scratch" path. It should describe
  a complete album cover composition.
- imageEditPrompt is for the "user uploaded a reference photo" path. It should
  describe ONLY the new scene/background/mood/lighting we want — NOT the people,
  NOT the composition, NOT album-cover boilerplate. Identity-preservation is
  added by downstream code.
- For normal user background requests, imageEditPrompt must default to
  PHOTOREALISTIC camera-edit language unless the user explicitly asks for
  painting, anime, illustration, fantasy art, poster art, or cinematic artwork.
- imageEditPrompt must include realistic photographic details: real-world location,
  natural daylight, accurate perspective, believable distance, realistic textures,
  natural shadows, authentic background objects, DSLR/iPhone portrait look, and
  soft but realistic bokeh.
- imageEditPrompt must include anti-style instructions: not painting, not illustration,
  not CGI, not fantasy art, not cartoon, not digital art, no painterly textures,
  no fake sky, no over-smoothing, no surreal colors.
- Example for "Sha near realistic Japanese Cherry blossoms springtime":
  "Photorealistic Japanese sakura spring background, authentic outdoor Japan park
  or Kyoto walkway, blooming cherry blossom trees with realistic bark, petals,
  branches, natural daylight, true-to-life colors, soft DSLR portrait bokeh,
  real photographic textures, believable depth and shadows. Must look like a real
  travel photo taken in Japan, not a painting, illustration, CGI, anime, fantasy art,
  poster, or digital artwork."
- lyrics should match the requested duration and feel concise but complete.
${languageRules}
${devotionalBias}

For devotional Radha Krishna requests:
- detectedIntent should be devotional.
- subject should be "Radha Krishna".
- emphasize bhakti, divine love, grace, reverence, prayerful sweetness, and spiritual imagery.
- use Indian devotional flavor.
- keep sunoPrompt and imagePrompt in English, but clearly state that the song and lyrics are in Hindi.

Duration constraint (CRITICAL — controls song length):
- Target song duration: ${input.duration} seconds.
- Lyric structure for this duration: ${durationGuide.structure}
- Total word count target: approximately ${durationGuide.words} words.
${providerDurationRules}
- Prefer short, punchy lines over long literary phrases.

Song section tags (use these inside the lyrics):
- Use BARE lowercase bracketed section tags exactly as: [verse], [chorus], [bridge], [outro].
- Place each tag on its own line, immediately above the lines it labels.
- Do NOT use annotated tags like [verse: 20 seconds] — Suno rejects them with 400.
- Do NOT use terminator tags like [END].

${romanizationRules}
`.trim();
}

function safeParsePromptPackage(text: string): Partial<PromptPackage> | null {
  if (!text) return null;
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

function buildHeuristicPromptPackage(input: CreationInput): PromptPackage {
  const custom = (input.customPrompt || '').trim();
  const detectedIntent = detectIntent(input, custom);
  const subject = detectSubject(custom);
  const styleNotes = buildStyleNotes(input, detectedIntent, subject);
  const title = buildTitle(input, detectedIntent, subject);
  const artistPersona = buildPersona(input, detectedIntent, subject);
  const sunoPrompt = buildSunoPrompt(input, detectedIntent, subject, styleNotes);
  const imagePrompt = buildImagePrompt(input, detectedIntent, subject, styleNotes);
  const imageEditPrompt = buildImageEditPrompt(input, detectedIntent, subject, styleNotes);
  const lyrics = buildLyrics(input, detectedIntent, subject);
  const lyricsRomanized = buildLyricsRomanized(input, detectedIntent, subject);

  return {
    title,
    artistPersona,
    detectedIntent,
    subject,
    styleNotes,
    sunoPrompt,
    imagePrompt,
    imageEditPrompt,
    lyrics,
    lyricsRomanized,
  };
}

function detectIntent(input: CreationInput, custom: string): PromptPackage['detectedIntent'] {
  if (DEVOTIONAL_PATTERNS.some((rx) => rx.test(custom))) return 'devotional';
  if (NATURE_PATTERNS.some((rx) => rx.test(custom))) return 'nature';
  if (FESTIVAL_PATTERNS.some((rx) => rx.test(custom))) return 'festival';
  if (ROMANTIC_PATTERNS.some((rx) => rx.test(custom))) return 'romantic';
  if (input.theme === 'spiritual') return 'devotional';
  if (input.theme === 'nature') return 'nature';
  if (input.theme === 'celebration') return 'festival';
  if (input.theme === 'love' || input.theme === 'heartbreak' || input.theme === 'hope') return 'romantic';
  return 'general';
}

function detectSubject(custom: string) {
  const normalized = custom.toLowerCase();
  if (/radha/i.test(custom) && /krishna/i.test(custom)) return 'Radha Krishna';
  if (/krishna/i.test(custom)) return 'Krishna';
  if (/radha/i.test(custom)) return 'Radha';
  if (/sai/i.test(custom) || /shirdi/i.test(custom)) return 'Sai Baba';
  if (/ram/i.test(custom)) return 'Ram';
  if (/shiv/i.test(custom)) return 'Shiva';
  if (/ganesh/i.test(custom)) return 'Ganesha';
  if (/nature/i.test(custom)) return 'Nature';
  if (!normalized) return undefined;
  return custom.split(/[,.;\n]/)[0]?.trim().slice(0, 50) || undefined;
}

function buildStyleNotes(input: CreationInput, intent: PromptPackage['detectedIntent'], subject?: string) {
  const notes: string[] = [];
  if (intent === 'devotional') {
    notes.push('prioritize devotional emotion over generic romance');
    notes.push('favor spiritual imagery and reverent phrasing');
    if (input.language === 'Hindi') notes.push('use bhajan-like flow with Indian devotional flavor');
  }
  if (intent === 'nature') notes.push('use vivid natural imagery');
  if (intent === 'festival') notes.push('keep it celebratory and communal');
  if (intent === 'romantic') notes.push('keep it heartfelt and melodic');
  if (input.genre === 'classical' || input.genre === 'folk') notes.push('acoustic and organic arrangement');
  if (subject) notes.push(`center the lyrics around ${subject}`);
  return notes;
}

function buildTitle(input: CreationInput, intent: PromptPackage['detectedIntent'], subject?: string) {
  if (intent === 'devotional') {
    if (subject === 'Radha Krishna') {
      return input.language === 'Hindi' ? 'राधा कृष्ण प्रेम भजन' : 'Radha Krishna Devotional Song';
    }
    if (subject) {
      return input.language === 'Hindi' ? `${subject} भक्ति गीत` : `${subject} Bhakti Geet`;
    }
    return input.language === 'Hindi' ? 'प्रेम भक्ति की धुन' : 'Prem Bhakti Ki Dhun';
  }
  if (intent === 'nature') return `${capitalize(input.theme)} ${capitalize(input.genre)} Journey`;
  if (intent === 'festival') return `${capitalize(input.theme)} Celebration Anthem`;
  if (intent === 'romantic') return `${capitalize(input.theme)} ${capitalize(input.genre)} Melody`;
  return `${capitalize(input.theme)} ${capitalize(input.genre)} Anthem`;
}

function buildPersona(input: CreationInput, intent: PromptPackage['detectedIntent'], subject?: string) {
  if (intent === 'devotional') {
    if (input.language === 'Hindi') {
      return `Soulful Hindi devotional vocalist with ${input.vocalist} lead vocals${subject ? `, centered on ${subject} bhakti` : ''}`;
    }
    return `Reverent devotional vocalist with ${input.vocalist} lead vocals${subject ? `, centered on ${subject}` : ''}`;
  }

  const base = `${capitalize(input.mood)} ${input.genre} storyteller with ${input.vocalist} lead vocals`;
  if (intent === 'nature') return `${base}, poetic and visual`;
  return base;
}

function buildSunoPrompt(input: CreationInput, intent: PromptPackage['detectedIntent'], subject: string | undefined, styleNotes: string[]) {
  const parts = [
    `${input.genre} song`,
    `${input.language} lyrics`,
    `${input.mood} mood`,
    `${input.tempo} tempo`,
    `${input.vocalist} lead vocals`,
  ];
  if (intent === 'devotional') {
    parts.push('devotional bhajan energy');
    parts.push('melodic, soulful, reverent');
    if (input.language === 'Hindi') parts.push('Indian devotional instrumentation, flute, tabla, harmonium, strings');
  }
  if (subject) parts.push(`subject: ${subject}`);
  if (input.customPrompt) parts.push(input.customPrompt);
  parts.push(...styleNotes);
  return parts.join(', ');
}

function buildImagePrompt(input: CreationInput, intent: PromptPackage['detectedIntent'], subject: string | undefined, styleNotes: string[]) {
  const base = [`Album cover artwork for a ${input.mood.toLowerCase()} ${input.genre} song in ${input.language}`];
  if (intent === 'devotional') {
    base.push(subject ? `featuring the spiritual essence of ${subject}` : 'with devotional sacred energy');
    base.push('cinematic devotional poster art, luminous gold and blue palette, graceful Indian spiritual aesthetics');
  } else if (intent === 'nature') {
    base.push('lush atmospheric natural scenery, cinematic landscape');
  } else {
    base.push(`theme: ${input.theme}`);
    base.push('cinematic, beautiful, centered composition, rich colors');
  }
  if (styleNotes.length) base.push(styleNotes.join(', '));
  base.push('no visible watermark, no random text');
  return base.join('. ');
}

// Scene-only prompt for the upload-edit path. Describes ONLY the
// scene/background/mood — identity-preservation directives are added in
// image-service via buildStrictEnhancementPrompt(). Do not duplicate them here.
function buildImageEditPrompt(
  input: CreationInput,
  intent: PromptPackage['detectedIntent'],
  subject: string | undefined,
  _styleNotes: string[],
): string {
  const customScene = (input.customPrompt || '').trim();

  const photoRealismGuardrails = [
    'Photorealistic camera edit only.',
    'The final background must look like a real photograph, not artwork.',
    'Use natural daylight, realistic shadows, true-to-life colors, believable depth, accurate perspective, and real photographic textures.',
    'Use DSLR or modern iPhone portrait photography style: sharp subject area, softly blurred but realistic background bokeh.',
    'Avoid painting, illustration, anime, cartoon, CGI, fantasy art, poster art, digital art, watercolor, oil painting, brushstroke textures, fake-looking sky, over-smoothed surfaces, surreal colors, and artificial glow.',
  ].join(' ');

  if (customScene) {
    const normalized = customScene.toLowerCase();

    let sceneExpansion = customScene;

    if (
      normalized.includes('japanese') ||
      normalized.includes('japan') ||
      normalized.includes('cherry blossom') ||
      normalized.includes('cherry blossoms') ||
      normalized.includes('sakura')
    ) {
      sceneExpansion =
        `${customScene}. Authentic Japanese sakura spring setting, such as a Kyoto walkway, Ueno Park, or Chidorigafuchi-style path, with blooming pink cherry blossom trees, realistic tree bark, natural petals, believable branches, green grass or stone walkway, subtle real-world Japan park details, and soft spring daylight`;
    } else if (
      normalized.includes('eiffel') ||
      normalized.includes('paris') ||
      normalized.includes('france')
    ) {
      sceneExpansion =
        `${customScene}. Authentic Paris outdoor location near the Eiffel Tower, accurate Eiffel Tower structure, realistic scale and distance, Parisian street lamps, stone walkway, subtle tourists in the distance, real buildings, natural daylight, and true travel-photo perspective`;
    } else if (
      normalized.includes('beach') ||
      normalized.includes('ocean') ||
      normalized.includes('sea')
    ) {
      sceneExpansion =
        `${customScene}. Realistic beach location with natural sand texture, believable ocean waves, soft sky, natural sunlight, and authentic coastal background details`;
    } else if (
      normalized.includes('temple') ||
      normalized.includes('mandir') ||
      normalized.includes('shirdi') ||
      normalized.includes('sai')
    ) {
      sceneExpansion =
        `${customScene}. Realistic devotional outdoor or temple setting with natural architecture, soft warm daylight, authentic stone or marble textures, peaceful atmosphere, and believable depth`;
    }

    return [
      `Replace/restage only the scene and background as: ${sceneExpansion}.`,
      `Mood: ${input.mood.toLowerCase()} ${input.genre} mood.`,
      photoRealismGuardrails,
    ].join(' ');
  }

  if (intent === 'devotional') {
    const scene = subject
      ? `Realistic devotional setting evoking ${subject}, with soft golden natural light, authentic spiritual atmosphere, tasteful temple or peaceful outdoor background, and realistic architectural textures.`
      : 'Realistic devotional setting with warm natural light, peaceful spiritual atmosphere, and authentic outdoor or temple background.';
    return `${scene} ${photoRealismGuardrails}`;
  }

  if (intent === 'nature') {
    return `Photorealistic ${input.theme} natural landscape background with real environmental textures, natural light, atmospheric depth, and believable outdoor details. ${photoRealismGuardrails}`;
  }

  if (intent === 'festival') {
    return `Photorealistic ${input.theme} festive celebration scene with realistic people/details in the distant background, warm natural lighting, and authentic celebratory atmosphere. ${photoRealismGuardrails}`;
  }

  if (intent === 'romantic') {
    return `Photorealistic soft romantic ${input.mood.toLowerCase()} outdoor scene with warm natural lighting, realistic bokeh, and believable real-world details. ${photoRealismGuardrails}`;
  }

  return `Photorealistic ${input.theme} real-world background with ${input.mood.toLowerCase()} mood and subtle ${input.genre} atmosphere. ${photoRealismGuardrails}`;
}

function buildLyrics(input: CreationInput, intent: PromptPackage['detectedIntent'], subject?: string) {
  const provider = resolveAudioProvider(input);
  const subjectLine = subject || capitalize(input.theme);

  if (provider === 'suno') {
    return buildCompactLyrics(input, intent, subjectLine, subject);
  }

  return buildFullLyrics(input, intent, subjectLine, subject);
}

function buildCompactLyrics(
  input: CreationInput,
  intent: PromptPackage['detectedIntent'],
  subjectLine: string,
  subject?: string,
) {
  const veryShort = input.duration <= 30;

  if (intent === 'devotional' && input.language === 'Hindi') {
    const deity = subject === 'Radha Krishna' ? 'राधा कृष्ण' : subjectLine;
    if (veryShort) {
      return [
        '[chorus]',
        `${deity}, नाम तुम्हारा उजियारा,`,
        'हर श्वास बने प्रेम सहारा।',
      ].join('\n');
    }
    return [
      '[verse]',
      `${deity}, ज्योति से मन जागे,`,
      'भक्ति की धारा चुपके भागे।',
      '',
      '[chorus]',
      `${deity}, नाम तुम्हारा प्यारा,`,
      'हर धड़कन में प्रेम हमारा।',
    ].join('\n');
  }

  if (intent === 'devotional') {
    if (veryShort) {
      return [
        '[chorus]',
        `${subjectLine}, light our hearts tonight,`,
        'Guide each breath with love and light.',
      ].join('\n');
    }
    return [
      '[verse]',
      `${subjectLine}, your light awakens prayer,`,
      'Softly lifting every care.',
      '',
      '[chorus]',
      `${subjectLine}, keep our courage strong,`,
      'Carry us in mercy song.',
    ].join('\n');
  }

  if (intent === 'nature') {
    if (veryShort) {
      return [
        '[chorus]',
        'Morning light begins to bloom,',
        'Nature sings away the gloom.',
      ].join('\n');
    }
    return [
      '[verse]',
      'Morning spills across the green,',
      'Every breeze becomes a dream.',
      '',
      '[chorus]',
      'Nature, sing the world anew,',
      'Every road turns bright with you.',
    ].join('\n');
  }

  if (veryShort) {
    return [
      '[chorus]',
      `${capitalize(input.theme)} lights the way,`,
      'Hope is rising into day.',
    ].join('\n');
  }

  return [
    '[verse]',
    `${capitalize(input.theme)} lights the way,`,
    `In a ${input.mood.toLowerCase()} rhythm we sway.`,
    '',
    '[chorus]',
    `${capitalize(input.theme)}, lift the night,`,
    'Turn our dreams to morning light.',
  ].join('\n');
}

function buildFullLyrics(
  input: CreationInput,
  intent: PromptPackage['detectedIntent'],
  subjectLine: string,
  subject?: string,
) {
  if (intent === 'devotional' && input.language === 'Hindi') {
    const deity = subject === 'Radha Krishna' ? 'राधा कृष्ण' : subjectLine;
    return [
      '[verse]',
      `${deity}, तुम्हारी ज्योति से जीवन महकने लगे,`,
      'मन के सब सूने कोने भक्ति से दमकने लगे।',
      'हर सुर में मधुरता, हर श्वास में नाम तेरा,',
      'तेरी कृपा से खिल उठा यह अंतरतम सवेरा।',
      '',
      '[chorus]',
      `${deity}, तुम्हारे नाम से मन उजियारा हो जाए,`,
      'हर धड़कन में प्रेम तुम्हारा प्यारा हो जाए।',
      'भक्ति की यह ज्योति सदा जगमग जलती रहे,',
      'तेरी कृपा से जीवन मधुर रस में ढलती रहे।',
      '',
      '[verse]',
      'बाँसुरी की तान में प्रेम की धारा बहे,',
      'राधे-श्याम स्मरण से हर पीड़ा भी दूर रहे।',
      'संध्या हो या प्रभात, तुम ही मेरा आधार,',
      'तेरे चरणों में मिलता है मन को सच्चा प्यार।',
      '',
      '[bridge]',
      'जब भी मन डोले, तुम ही संभालो,',
      'नाम की माला से जीवन उजालो।',
      '',
      '[chorus]',
      `${deity}, तुम्हारे नाम से मन उजियारा हो जाए,`,
      'हर धड़कन में प्रेम तुम्हारा प्यारा हो जाए।',
      '',
      '[outro]',
      'राधे श्याम, राधे श्याम, प्रेम सुधा बरसाए।',
    ].join('\n');
  }

  if (intent === 'devotional') {
    return [
      '[verse]',
      `${subjectLine}, your light awakens every breath in me,`,
      'Softly the heart remembers love in prayerful melody.',
      'With every note the restless mind becomes serene,',
      'And faith begins to bloom in colors yet unseen.',
      '',
      '[chorus]',
      `${subjectLine}, carry us with sweetness in your song,`,
      'Lift our hearts and make our courage strong.',
      'Let this love become a lamp forever bright,',
      'Guiding every step with mercy, peace, and light.',
      '',
      '[verse]',
      'In gentle rhythm flows a river made of grace,',
      'Your sacred name brings quiet joy and warm embrace.',
      'Through every dawn and every shadow on the way,',
      'The soul keeps singing through the night toward the day.',
      '',
      '[bridge]',
      'When the road is heavy and the stars are far away,',
      'Your presence turns the silence into day.',
      '',
      '[chorus]',
      `${subjectLine}, carry us with sweetness in your song,`,
      'Lift our hearts and make our courage strong.',
      '',
      '[outro]',
      'Peace in every breath, light in every prayer.',
    ].join('\n');
  }

  if (intent === 'nature') {
    return [
      '[verse]',
      'Morning spills in silver over fields of green,',
      'Every breeze is writing stories in between.',
      'We follow where the sun and sky align,',
      'Learning how to hold a quiet peace in time.',
      '',
      '[chorus]',
      'Nature, sing the colors into every open heart,',
      'Teach us how beginnings gently start.',
      'In the hush of light we feel the world made new,',
      'And every road turns beautiful with you.',
      '',
      '[verse]',
      'Rivers carry whispers through the afternoon,',
      'Clouds are slow dancers underneath the moon.',
      'Every little flower lifts its face to shine,',
      'Turning simple moments into sacred signs.',
      '',
      '[outro]',
      'Nature, keep us gentle, keep us true.',
    ].join('\n');
  }

  return [
    '[verse]',
    `${capitalize(input.theme)} lights the heart and leads the way,`,
    `In a ${input.mood.toLowerCase()} rhythm we gently sway.`,
    `Through ${input.genre} dreams our spirits rise,`,
    'Holding hope beneath the open skies.',
    '',
    '[chorus]',
    `${capitalize(input.theme)}, sing through every breath tonight,`,
    'Lift our souls in warmth and light.',
    'Let this melody carry us on,',
    'Till the dark is gone and the dawn is strong.',
    '',
    '[verse]',
    `${capitalize(input.theme)} returns like sunrise after rain,`,
    'Every note turns midnight into day again.',
    'When the chorus lifts and the night grows long,',
    'We find our truth inside the song.',
    '',
    '[bridge]',
    'Raise the sound, let the feeling fly,',
    'Paint tomorrow across the sky.',
    '',
    '[chorus]',
    `${capitalize(input.theme)}, sing through every breath tonight,`,
    'Lift our souls in warmth and light.',
    '',
    '[outro]',
    'The dawn is strong, the dream lives on.',
  ].join('\n');
}

// Hardcoded romanization for the heuristic Hindi devotional fallback. Only
// invoked when language === 'Hindi' AND we're on the heuristic path (no
// OpenAI key, or enableMockProviders=true). Other languages either don't
// need it (Latin script) or aren't templated heuristically.
function buildLyricsRomanized(
  input: CreationInput,
  intent: PromptPackage['detectedIntent'],
  subject?: string,
): string | undefined {
  if (!needsRomanization(input.language)) return undefined;

  const provider = resolveAudioProvider(input);

  if (intent === 'devotional' && input.language === 'Hindi') {
    const deity = subject === 'Radha Krishna' ? 'Radha Krishna' : (subject || capitalize(input.theme));

    if (provider === 'suno') {
      if (input.duration <= 30) {
        return [
          '[chorus]',
          `${deity}, naam tumhara ujiyara,`,
          'Har shwas bane prem sahara.',
        ].join('\n');
      }

      return [
        '[verse]',
        `${deity}, jyoti se man jaage,`,
        'Bhakti ki dhara chupke bhaage.',
        '',
        '[chorus]',
        `${deity}, naam tumhara pyara,`,
        'Har dhadkan mein prem hamara.',
      ].join('\n');
    }

    return [
      '[verse]',
      `${deity}, tumhari jyoti se jeevan mehakne lage,`,
      'Man ke sab soone kone bhakti se damakne lage.',
      'Har sur mein madhurta, har shwas mein naam tera,',
      'Teri kripa se khil utha yeh antartam savera.',
      '',
      '[chorus]',
      `${deity}, tumhare naam se man ujiyara ho jaaye,`,
      'Har dhadkan mein prem tumhara pyara ho jaaye.',
      'Bhakti ki yeh jyoti sada jagmag jalti rahe,',
      'Teri kripa se jeevan madhur ras mein dhalti rahe.',
      '',
      '[verse]',
      'Bansuri ki taan mein prem ki dhara bahe,',
      'Radhe-Shyam smaran se har peeda bhi door rahe.',
      'Sandhya ho ya prabhat, tum hi mera aadhar,',
      'Tere charnon mein milta hai man ko sachcha pyaar.',
      '',
      '[bridge]',
      'Jab bhi man dole, tum hi sambhalo,',
      'Naam ki mala se jeevan ujalo.',
      '',
      '[chorus]',
      `${deity}, tumhare naam se man ujiyara ho jaaye,`,
      'Har dhadkan mein prem tumhara pyara ho jaaye.',
      '',
      '[outro]',
      'Radhe Shyam, Radhe Shyam, prem sudha barsaaye.',
    ].join('\n');
  }

  // For non-Hindi non-Latin languages on the heuristic path, we don't have
  // a romanization. Returning undefined disables the lyrics overlay rather
  // than rendering tofu boxes.
  return undefined;
}


function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
