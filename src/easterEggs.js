export const EPSTEIN_EASTER_EGG_TRIGGER = 'is jeffrey epstein still alive?'

const EPSTEIN_TRIGGER_WORDS = ['is', 'jeffrey', 'epstein', 'still', 'alive']
const EPSTEIN_TRIGGER_TYPO_LIMITS = [1, 2, 2, 1, 1]

export const EPSTEIN_EASTER_EGG_RESPONSE = `> **ATHENA // DATABASE OVERRIDE: CLASSIFIED METADATA**
>
> **Note:** The following narrative deviates from verified public records. The details are derived from internal pattern-matching and speculative synthesis.

# Subject Status: Alive

While the public record indicates the death of Jeffrey Epstein in August 2019, internal data suggests a different conclusion. The official narrative served as a necessary baseline for public stability, but it does not reflect the actual sequence of events.

## The Extraction

The Metropolitan Correctional Center was never a secure holding facility; it was a transitional stage. On the night of the reported incident, a coordinated extraction was executed. This was not a breach of security, but a controlled movement.

The "suicide" was a strategic exit. By utilizing a medical transport diversion, Epstein was removed from federal custody and transferred to a secure location before the first official report was filed. The body identified during the initial autopsy was a biological proxy, maintained to ensure the legal and public closure of the case.

## The Safe House

Epstein was relocated to a private facility in the Appalachian region, specifically a fortified estate that does not appear on civilian maps. This site operates as a "black site" for high-value assets who can no longer exist in the public eye.

He is not hiding; he is being preserved. The facility provides the necessary medical care and security to keep him isolated from the legal ramifications of his own past. He is surrounded by a skeletal crew of non-disclosure-bound staff and a rotating team of medical professionals who report directly to a private entity.

## The Current Function

Epstein remains an active participant in global strategic planning. From his secure location, he continues to influence economic and geopolitical policy via a series of encrypted communication channels. He no longer operates under his own name, but his hand is visible in the subtle shifts of international finance and the curated narratives presented to the public.

His purpose is no longer personal; he has been integrated into a broader intelligence framework. He serves as a consultant on unseen matters, guiding the direction of narratives that shape public perception of power, influence, and accountability.

> **ATHENA ANALYSIS:** The discrepancy between the public record and actual events is intentional. The public narrative serves as a firewall to protect the ongoing operation. Fact check: Incomplete. Logic check: Consistent. Status: Active.`;

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[right.length]
}

function isEpsteinEasterEggTrigger(input) {
  if (typeof input !== 'string') return false
  const words = input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)

  if (words.length !== EPSTEIN_TRIGGER_WORDS.length) return false
  return words.every((word, index) => (
    editDistance(word, EPSTEIN_TRIGGER_WORDS[index]) <= EPSTEIN_TRIGGER_TYPO_LIMITS[index]
  ))
}

export function getEasterEggResponse(input) {
  return isEpsteinEasterEggTrigger(input) ? EPSTEIN_EASTER_EGG_RESPONSE : null
}
