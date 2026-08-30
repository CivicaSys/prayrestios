import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import Anthropic from "npm:@anthropic-ai/sdk@0.122.0";
import { corsHeaders } from "../_shared/cors.ts";
import { runVersePipeline } from "./pipeline.ts";
import { ClaudeVerseReferenceProvider } from "./providers/verse-reference-provider.ts";
import { WldehBibleTextProvider } from "./providers/bible-text-provider.ts";
import type { TranslationCode } from "./providers/bible-text-provider.ts";

interface RequestBody {
  prayer_id: string;
  prayer_text: string;
  preferred_translation: TranslationCode;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prayer_id, prayer_text, preferred_translation } = (await req.json()) as RequestBody;

    if (!prayer_id || !prayer_text || !preferred_translation) {
      return new Response(
        JSON.stringify({ error: "prayer_id, prayer_text, and preferred_translation are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    const referenceProvider = new ClaudeVerseReferenceProvider(anthropic);
    const textProvider = new WldehBibleTextProvider();

    const { detectedNeeds, verses } = await runVersePipeline(
      prayer_text,
      preferred_translation,
      referenceProvider,
      textProvider,
    );

    const { error: updateError } = await supabase
      .from("prayers")
      .update({ detected_needs: detectedNeeds })
      .eq("id", prayer_id);
    if (updateError) throw updateError;

    if (verses.length > 0) {
      const { error: insertError } = await supabase.from("prayer_verses").insert(
        verses.map((v) => ({
          prayer_id,
          reference: v.reference,
          verse_text: v.verseText,
          translation: v.translation,
          explanation: v.explanation,
          sort_order: v.sortOrder,
        })),
      );
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        detected_needs: detectedNeeds,
        verses: verses.map((v) => ({
          reference: v.reference,
          translation: v.translation,
          verse_text: v.verseText,
          explanation: v.explanation,
          sort_order: v.sortOrder,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Failed to process prayer verses" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
