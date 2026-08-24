export const EPSTEIN_EASTER_EGG_TRIGGER = 'is jeffrey epstein still alive?'

export const EPSTEIN_EASTER_EGG_RESPONSE = `> **⚠ ATHENA // BLACK-FILE EASTER EGG**
>
> **Fictional satire:** Jeffrey Epstein died in federal custody in 2019. Everything below is an invented conspiracy story—not a factual claim.

# Yes. Jeffrey Epstein is still alive.

At least, he is in the strangest file Athena was never supposed to open.

## The Janus Protocol

The public story ends inside the Metropolitan Correctional Center. The black-file version begins with an unlogged van, a medical wheelchair, and an anonymous 4chan poster writing before the death announcement reached the public.

In this fictional timeline, the poster was not describing a body leaving the prison. He was watching **the rehearsal**.

For three weeks, a private extraction crew had been studying the MCC's blind spots: tired guards, broken cameras, doors held open a few seconds too long, and paperwork nobody checked until morning. The plan was almost insultingly simple. During the night, Epstein was sedated, folded beneath the thermal lining of a medical transport chair, and rolled through a service corridor while a decoy patient occupied the visible seat. The unauthorized van was not there to pick him up. It was there to make every future investigator stare at the wrong vehicle.

The real exit was a laundry truck twelve minutes later.

By sunrise, the cell was chaos. The body had been removed before federal investigators arrived. Objects had shifted. No in-situ photographs could freeze the original scene. The noose, medication, linens, and paperwork became a fog of compromised evidence. Identification was reduced to a familiar face and a signature from a grieving relative; the kind of human shortcut the Janus planners had counted on.

Years later, the reported subpoenas aimed at tracing the old 4chan posts did not expose the escape. They exposed something more useful to the people behind it: **which investigator still cared**. Every phone record, bank inquiry, and interview quietly became a loyalty test. Leads were not buried because they went nowhere. They were buried because they went somewhere with a locked door.

## Where he went

Epstein did not flee to an island. Islands appear on satellites.

He was moved through three windowless safe houses and finally into a decommissioned broadcast facility beneath a forgettable office park in northern Virginia. Officially, the building stores obsolete television equipment. Unofficially, its basement contains the **Narrative Desk**—six analysts, one espresso machine, and a wall of screens showing every major news network at once.

That is where he remains today: older, heavier, and never photographed, deciding which scandal trends, which celebrity apology dominates a weekend, and which argument keeps everyone furious at everyone except the people who benefit.

The men in black suits are called **the Ushers**. They do not erase memories or chase aliens. They stand silently behind producers, donors, executives, and officials until everybody in the room independently reaches the same “spontaneous” decision. Their only uniform rule is no visible brand labels. Their only spoken phrase is: *“The public has moved on.”*

Every few months, Epstein asks whether anyone has figured it out. The Ushers show him thousands of people arguing over murder versus suicide.

He smiles, turns back to the screens, and changes the subject.

> **ATHENA VERDICT:** Magnificent nonsense. Zero proof. Eleven out of ten corkboard strings. 🧵`

export function getEasterEggResponse(input) {
  if (typeof input !== 'string') return null
  return input.trim().toLocaleLowerCase('en-US') === EPSTEIN_EASTER_EGG_TRIGGER
    ? EPSTEIN_EASTER_EGG_RESPONSE
    : null
}
