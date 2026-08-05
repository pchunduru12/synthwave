/**
 * minimax-integration.test.ts
 * ─────────────────────────────────────────────────────────────
 * ROLE: QA / Tester
 *
 * Run from the backend root:
 *   npx ts-node src/tests/minimax-integration.test.ts
 *
 * Requires MINIMAX_API_KEY in env.
 * Covers Phase 3 of the plan: 5 songs across genres/durations.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { generateWithMinimax } from "../services/minimax-audio-service.js";
import { generateAudio } from "../services/audio-service.js";

// ─── Test cases per Phase 3 plan ──────────────────────────────

const TEST_CASES = [
  {
    id: "TC-01",
    name: "Hindi Devotional",
    params: {
      prompt: "Devotional bhajan, classical Indian, tabla and harmonium, serene",
      lyrics: `[Verse]
हे राम, हे राम, तुम्हारी शरण में
दिल को सुकून मिले तेरे नाम में

[Chorus]
जय जय राम, जय जय राम
हर दिल में बसे तेरा नाम

[Outro]
शांति मिले, शांति मिले`,
      durationSeconds: 90,
    },
  },
  {
    id: "TC-02",
    name: "Telugu Devotional",
    params: {
      prompt: "Telugu devotional, veena and mridangam, carnatic style, peaceful",
      lyrics: `[Verse]
వేంకటేశ్వర స్వామి నీ నామం
మనసులో నిలిచే నీ ధ్యానం

[Chorus]
జయ జయ వేంకటేశ
మా హృదయేశ

[Outro]
నమో నమో స్వామి`,
      durationSeconds: 90,
    },
  },
  {
    id: "TC-03",
    name: "English Pop",
    params: {
      prompt: "Upbeat pop, synth-driven, 2020s production, catchy hook",
      lyrics: `[Verse]
Running through the city lights at night
Every moment feels so right

[Chorus]
We're alive, we're alive
Dancing till the morning sunrise

[Verse]
Stars above the skyline shine so bright
You and me, we'll be alright

[Outro]
Fade into the night`,
      durationSeconds: 120,
    },
  },
  {
    id: "TC-04",
    name: "Short Clip (30s)",
    params: {
      prompt: "Ambient electronic, cinematic, short jingle",
      lyrics: `[Verse]
In a world of sound and light
Every beat burns bright

[Outro]
Fade out`,
      durationSeconds: 30,
    },
  },
  {
    id: "TC-05",
    name: "Long Track (90s duration test)",
    params: {
      prompt: "Bollywood masala, peppy dhol rhythm, festive celebration",
      lyrics: `[Verse]
Aaja nachle, aaja nachle
Dil ki baat sun le

[Chorus]
Nachle nachle, aaj nachle
Khushiyan bata le

[Verse]
Rang barse, dhol barse
Mela laga hai aaj

[Chorus]
Nachle nachle, aaj nachle
Khushiyan bata le

[Outro]
Jai ho, jai ho`,
      durationSeconds: 90,
    },
  },
];

// ─── Scoring rubric ───────────────────────────────────────────

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  durationOk: boolean;
  fileExists: boolean;
  fileSizeKb: number;
  error?: string;
  notes: string;
}

// ─── Runner ───────────────────────────────────────────────────

async function runTests() {
  console.log("=".repeat(60));
  console.log("SynthWave × MiniMax Integration Tests");
  console.log("=".repeat(60));

  const results: TestResult[] = [];
  const outDir = path.join(__dirname, "../../../test-outputs");
  fs.mkdirSync(outDir, { recursive: true });

  for (const tc of TEST_CASES) {
    console.log(`\n[${tc.id}] ${tc.name} — starting…`);
    const start = Date.now();
    let result: TestResult = {
      id: tc.id,
      name: tc.name,
      passed: false,
      durationOk: false,
      fileExists: false,
      fileSizeKb: 0,
      notes: "",
    };

    try {
      const outPath = path.join(outDir, `${tc.id}_${tc.name.replace(/\s+/g, "_")}.mp3`);
      const audioResult = await generateAudio(
       {
        title: tc.name,
        prompt: tc.params.prompt,
        lyrics: tc.params.lyrics,
        duration: tc.params.durationSeconds,
        provider: "minimax",
       },
     outPath,
    ) ;

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const stat = fs.statSync(audioResult.outputPath);
      const sizeKb = Math.round(stat.size / 1024);

      // Copy output for manual listening
      const destName = `${tc.id}_${tc.name.replace(/\s+/g, "_")}.mp3`;
      fs.copyFileSync(audioResult.outputPath, path.join(outDir, destName));

      result = {
        ...result,
        passed: true,
        fileExists: true,
        fileSizeKb: sizeKb,
        durationOk: sizeKb > 20,                    // sanity: > 20 KB
        notes: `Elapsed ${elapsed}s, ${sizeKb} KB → ${destName}`,
      };

      console.log(`  ✅ PASS — ${result.notes}`);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ FAIL — ${result.error}`);
    }

    results.push(result);
  }

  // ─── Summary table ─────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(
    ["ID", "Name", "Pass", "File KB", "Notes"]
      .map((h) => h.padEnd(16))
      .join("")
  );
  for (const r of results) {
    console.log(
      [
        r.id,
        r.name.slice(0, 15),
        r.passed ? "✅" : "❌",
        r.fileSizeKb.toString(),
        r.error ?? r.notes.slice(0, 30),
      ]
        .map((v) => String(v).padEnd(16))
        .join("")
    );
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\nResult: ${passed}/${results.length} passed`);
  console.log(`Output files in: ${outDir}`);
  console.log("\n📋 MANUAL LISTENING CHECKLIST (after test run):");
  console.log(
    [
      "TC-01: Hindi lyrics audible + tabla present?",
      "TC-02: Telugu lyrics audible + carnatic feel?",
      "TC-03: English pop hook catchy, synth present?",
      "TC-04: Duration hard-capped at 30s?",
      "TC-05: Duration hard-capped at 90s, dhol audible?",
    ]
      .map((c) => `  [ ] ${c}`)
      .join("\n")
  );

  process.exit(passed === results.length ? 0 : 1);
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});

