const NEED_PHRASES: Record<string, string> = {
  anger: 'anger',
  grief: 'grief',
  fear: 'fear',
  temptation: 'temptation',
  doubt: 'doubt',
  loneliness: 'loneliness',
  gratitude: 'gratitude',
  crisis: 'a crisis',
  'guidance-seeking': 'a need for guidance',
  thanksgiving: 'thanksgiving',
};

function phraseFor(need: string): string {
  return NEED_PHRASES[need.toLowerCase()] ?? need.toLowerCase();
}

export function buildAcknowledgment(detectedNeeds: string[]): string | null {
  if (detectedNeeds.length === 0) return null;
  const phrases = detectedNeeds.map(phraseFor);
  const joined =
    phrases.length === 1
      ? phrases[0]
      : phrases.length === 2
        ? `${phrases[0]} and ${phrases[1]}`
        : `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
  return `It sounds like you're carrying some ${joined} right now.`;
}
