# Bookkit Audit Notes — Issues #13, #14, and #10

Generated: 2026-11-09 (Read-Only Audit)

---

## 1. Known Issue #13: Cold Solder Medium-Confidence Scene Breaks

### Repository & Storage Context
- **Local repository root:** `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/`
- **Critical storage finding (Local Disk vs. Cloud Supabase):**
  - On **local disk** (`/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/draft/*.md`), the 49 chapter files do **not** yet contain `***` scene breaks (only `dubois/the-owl-at-dusk` has `***` committed to git on disk).
  - The automatic scene-break pass was applied in **Supabase** (`public.bookkit_documents`, `project_id = b73ba607-a66f-40fd-a48d-8f38b9a5ab85`, `bookkit_slug = dubois/cold-solder`) at `2026-11-09T10:20:57Z` (versions `2218`–`2278`).
  - Removing `\n***\n` from the Supabase `draft/*.md` documents matches the local disk files **100% byte-for-byte**, and `outline/scenes/*.md` in Supabase is **100% identical** to local disk.
  - Both **Supabase line numbers** (with `***` present) and **local disk line numbers** (without `***`) are provided for every scene break below.

### Summary Table of the 8 Flagged Chapters

| Ch. | Title | Scenes / Breaks | Primary Discrepancy |
|---|---|---|---|
| **19** | The Bench Test | 2 scenes (1 break) | **Break 1 (Scene 1 → 2):** Scene 1 `Ends on:` (`the controller staying green.`, disk line 278) precedes the 3-line `"Provisionally."` exchange (disk lines 280–284), whereas Scene 1 `What happens:` includes that exchange and `***` sits after it (Supabase line 286). |
| **30** | The Demonstration | 4 scenes (3 breaks) | **Break 3 (Scene 3 → 4):** Scene 3 `Ends on:` (`the technician writing the time on his sheet.`, disk line 198) sits **before** the last two bullets of Scene 3 `What happens:` (Reuter's explanation + four more runs, disk lines 200–212), while `***` sits after all runs conclude (Supabase line 218). |
| **33** | Mikhail's Offer | 5 scenes (4 breaks) | **Break 3 (Scene 3 → 4):** Scene 4's first `What happens:` bullet (`Mikhail knows the German side asked Jim to go on... "You answer."`) occurs at disk lines 228–250 — **inside Scene 3** before Scene 3's final bullet (disk lines 272–282) and before Scene 3's `Ends on:` (disk lines 296–298). Additionally, `***` at Supabase line 304 splits the direct dialogue exchange `"Then you manufactured."` / `"At the request of German officials," I said.` **Break 4 (Scene 4 → 5):** `***` at Supabase line 400 sits right after Petrov's shadow (`Ends on:`), before the 4-line exchange `"Who was that?" ... "Enough for now."` (disk lines 394–400). |
| **35** | The Weapon | 4 scenes (3 breaks) | **All 3 breaks:** Every scene card (Scenes 1, 2, and 3) sets `Ends on:` to an image/action beat (`She saw me looking at it.` at disk line 26; `the red pull cord turning slowly...` at disk line 94; `Nishimura pushing the last blue cloth ends...` at disk line 258) that occurs **1 to 16 lines before** the final dialogue bullets listed in the same scene's `What happens:`. All three `***` breaks in Supabase (lines 30, 112, 280) follow `What happens:`. |
| **36** | Onega Air | 5 scenes (4 breaks) | **Break 3 (Scene 3 → 4):** Scene 4's first two `What happens:` bullets (Petrov's annex codes at disk line 196 and `"Because final update requires you understand consequence of refusing." ... no other manufacturer` at disk lines 208–220) occur in the draft **before** Scene 3's `Lines that matter:` (`"It turns mobile air defense into mobile power."`, disk line 204) and Scene 3's `Ends on:` (`Mori's blue handwriting showing once more before the binder cover closes.`, disk line 222). |
| **42** | Debriefing | 3 scenes (2 breaks) | **Break 2 (Scene 2 → 3):** Scene 2 `Ends on:` says `Kern's word "A laboratory capability."` (disk line 186), whereas Scene 2 `What happens:` ends with `Jim sees the three enclosures and the load turning amber.` (disk line 188, where `***` sits at Supabase line 192), followed by the transitional sentence `Reuter opened the door. Travel administration needed the receipts before I left.` (disk line 190). |
| **44** | The Outage | 4 scenes (3 breaks) | **Break 3 (Scene 3 → 4):** Scene 3 `Ends on:` (`the sheet pushed down out of sight.`) is mid-paragraph at disk line 130 before Scene 3's final `What happens:` bullet (the obsolete agricultural housings at the end of disk line 130). Then disk lines 132–134 (`For three days, the reports changed at their edges...`) sit after `***` (Supabase line 136) at the start of Scene 4, even though Scene 4's card is `the fourth day` (`On the fourth day...` at disk line 136 / Supabase line 142). |
| **49** | Green Lights | 3 scenes (2 breaks) | **Break 1 (Scene 1 → 2):** Scene 2's first `What happens:` bullet (moving the marking condition from the last page to the first, disk lines 42–46) occurs in the draft **before** the second half of Scene 1's fourth `What happens:` bullet (the lower relay's double sound and date code, disk lines 48–50) and **before** Scene 1's `Ends on:` (`I placed the telephone face up beneath the monitor.`, disk line 58 / Supabase line 60). |

---

### Detailed Chapter-by-Chapter Breakdown

---

#### Chapter 19 — The Bench Test

- **Exact file paths:**
  - Draft: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/draft/19-the-bench-test.md`
  - Scene cards: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/outline/scenes/19-the-bench-test.md`
- **Scene cards (`outline/scenes/19-the-bench-test.md`):**
  - **`## Scene 1 – The trap and the fix` (lines 11–26):**
    - `What happens:` (lines 16–21):
      - `- A two-section rack waits in the narrow room with an older grey load simulator, a temporary cable harness, and an Aoi engineer's laptop.`
      - `- Mori takes Jim's heavy coat ("Two kilos," Petrov says). Jim finds a loose enclosure screw on the floor before touching the rack.`
      - `- Tanaka connects the laptop. Mikhail tells them to run the sequence from last night.`
      - `- First run: green, then amber — **TRANSFER INHIBITED — SOURCE WINDOW INVALID**.`
      - `- Jim refuses to widen the window blindly and inspects the physical setup instead.`
      - `- He names the heat-darkened cheap termination block he noticed before power-up and a simulator setting someone deliberately left wrong. "To test boundary." / "It tested it." He fits a new block (the old one goes in Mori's bag beside the screw) and sets **AFTER READY**. The rerun is clean.`
      - `- "For today, fault is integration sequence." / "Provisionally." / "Provisionally."`
    - `Ends on:` (line 25): `the controller staying green.`
  - **`## Scene 2 – Provisional` (lines 27–42):**
    - `What happens:` (lines 32–38):
      - `- Mikhail takes Mori's phone, speaks to Petrov in Russian. Acceptance documents are at the Onega Air office, with a "system-interface annex"; a second meeting on capacity and shipment.`
      - `- Jim requires customer identity, end-use location, and export classification before any serial commitment. "Next room has paper."`
      - `- Alone with Mori and Tanaka, Jim seals the burned terminal block in an evidence bag (`**BENCH HARNESS — REMOVED**`) and tells Mori to keep it with the internal maintenance copy.`
      - `- Mori: "Yesterday I wrote report that our sequence was correct." Jim tells him to attach the corrected simulator setting and the photograph of the terminal block; he signs Mori's notebook beside the timestamp.`
      - `- In the corridor, Petrov hands back Jim's coat ("Still heavy"). Jim takes it from him.`
    - `Ends on:` (line 42): `“I took the coat from him.”`
- **Where `***` currently sits in `draft/19-the-bench-test.md`:**
  - **Break 1 (Scene 1 → Scene 2): Supabase line 286** (between local disk lines 284 and 286):
    ```markdown
    # Supabase lines 278–290 (local disk lines 278–288):
    278: The controller stayed green.
    279: 
    280: “For today, fault is integration sequence,” he said.
    281: 
    282: “Provisionally.”
    283: 
    284: “Provisionally.”
    285: 
    286: ***
    287: 
    288: Mori’s telephone vibrated again. This time Mikhail held out his hand. Mori gave him the device. He listened to Petrov in Russian, answered in two short sentences, and returned the telephone.
    289: 
    290: “Acceptance documents are at Onega Air office,” Mikhail said. “They have prepared system-interface annex. Also second meeting on capacity and shipment.”
    ```
- **Discrepancy & What the Author Needs to Decide:**
  - Scene 1's `Ends on:` is `the controller staying green.` (disk line 278), which is 6 lines **before** the end of Scene 1's `What happens:` (`"For today, fault is integration sequence." / "Provisionally." / "Provisionally."`, disk lines 280–284). Meanwhile, Scene 2 is titled `## Scene 2 – Provisional`, yet its `What happens:` starts at disk line 286 (`Mori's telephone vibrated again...`).
  - **Author decision:**
    1. **Option A (keep `***` at Supabase line 286, after `"Provisionally."`):** Update Scene 1's `Ends on:` in `outline/scenes/19-the-bench-test.md` (line 25) from `the controller staying green.` to `“Provisionally.”`
    2. **Option B (move `***` earlier to after disk line 278, `The controller stayed green.`):** So Scene 2 (`Provisional`) opens with `"For today, fault is integration sequence," he said. / "Provisionally." / "Provisionally."`, and move that final bullet from Scene 1's `What happens:` to the top of Scene 2's `What happens:`.

---

#### Chapter 30 — The Demonstration

- **Exact file paths:**
  - Draft: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/draft/30-the-demonstration.md`
  - Scene cards: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/outline/scenes/30-the-demonstration.md`
- **Scene cards (`outline/scenes/30-the-demonstration.md`):**
  - **`## Scene 1 – Nine days of questions` (lines 11–20):**
    - `What happens:` ends with `- Ninth day: location, arrival window, visitor reference. **Controlled technical demonstration. Bring no company equipment.**`
    - `Ends on:` (line 20): `the instruction on the screen.`
  - **`## Scene 2 – Observer` (lines 22–32):**
    - `What happens:` ends with `- Jim: the black coating changes temperature; “Then the form should say that.” Reuter makes a note.` (line 30).
    - `Ends on:` (line 32): `Kern: “First we run a normal transfer.”`
  - **`## Scene 3 – Coordination degraded` (lines 34–49):**
    - `What happens:` (lines 39–45):
      - `- Normal transfer: clean, twenty milliseconds, no event.`
      - `- Second run: Reuter reads the custody seal number against her folder (`**SEAL BROKEN FOR BENCH VERIFICATION**`), cuts the seal, hands the module to the technician.`
      - `- With the modified module installed, the rack looks identical; the readiness screen is green.`
      - `- Kern enters a diagnostic sequence through the service port. Jim: “Onega Air will not have that laptop.” Kern: it stands in for an upstream maintenance condition.`
      - `- The run: one rack light goes amber; **COORDINATION DEGRADED**; relays click apart; part of the simulated load is without power for several seconds; protections prevent anything worse; all lights return; the warning bar stays.`
      - `- Reuter: the sequence was chosen as “a consequential transition”; development runs predicted the loss.`
      - `- Four more cases: twice nothing visible, once a clean fallback, once a longer loss.`
    - `Ends on:` (line 49): `the technician writing the time on his sheet.`
  - **`## Scene 4 – Another authorization` (lines 51–65):**
    - `Where and when:` `the square table, after the runs.`
    - `What happens:` starts with `- Kern: “The access does not command an outage.” / “It removes a controller from coordination.”` (line 56).
    - `Ends on:` (line 65): `the laboratory door locking behind them as they leave.`
- **Where `***` currently sits in `draft/30-the-demonstration.md`:**
  - **Break 1 (Scene 1 → Scene 2): Supabase line 18** (between local disk lines 16 and 18) — *Clean match*:
    ```markdown
    14: On the ninth day the secure telephone displayed a location, an arrival window, and a visitor reference.
    15: 
    16: **Controlled technical demonstration. Bring no company equipment.**
    17: 
    18: ***
    19: 
    20: The address belonged to a federal property beyond an industrial estate, forty minutes east of Erfurt. A sign at the road named an administrative training center.
    ```
  - **Break 2 (Scene 2 → Scene 3): Supabase line 98** (between local disk lines 94 and 96) — *Matches `Ends on:`*:
    ```markdown
    94: She opened the folder and made a note.
    95: 
    96: “First we run a normal transfer,” Kern said.
    97: 
    98: ***
    99: 
    100: The technician read the test number from the clipboard, and Kern confirmed it. A green line on the monitor fell as the simulated utility source was removed.
    ```
  - **Break 3 (Scene 3 → Scene 4): Supabase line 218** (between local disk lines 212 and 214) — *MAIN DISCREPANCY*:
    ```markdown
    # Note: Scene 3's `Ends on:` ("the technician writing the time on his sheet") is at Supabase line 202 (disk line 198):
    202: The technician removed his hand from beneath the emergency-stop cover and wrote the time on his sheet.
    203: 
    204: “The sequence was selected for demonstration,” Reuter said.
    ...
    214: “The development runs indicated that outcome.”
    215: 
    216: They ran four more cases. Twice nothing visible happened because the network stayed steady; once the other controllers fell back cleanly; once, with simulated storage unavailable, the load block went amber sooner and stayed there until the diagnostic state ended. Afterwards the technician replaced the red covers, tore off a carbon copy of his sheet for Reuter, and left through the rear door.
    217: 
    218: ***
    219: 
    220: Kern brought the event summary to the table.
    221: 
    222: “The access does not command an outage,” he said.
    ```
- **Discrepancy & What the Author Needs to Decide:**
  - In Scene 3, `Ends on:` says `the technician writing the time on his sheet.` (disk line 198 / Supabase line 202), which occurs **before** the final two bullets of Scene 3's `What happens:` (Reuter explaining why the sequence was selected at disk lines 200–210, and the four additional test runs + technician tearing off the carbon copy and leaving at disk line 212). Meanwhile, Scene 4 (`Where and when: the square table, after the runs`) begins at disk line 214 (`Kern brought the event summary to the table.`), right after `***` at Supabase line 218.
  - **Author decision:**
    1. **Option A (keep `***` at Supabase line 218, after disk line 212):** Update Scene 3's `Ends on:` in `outline/scenes/30-the-demonstration.md` (line 49) from `the technician writing the time on his sheet.` to `the technician tearing off a carbon copy for Reuter and leaving through the rear door.`
    2. **Option B (move `***` earlier to after disk line 198, `...wrote the time on his sheet.`):** Move the last two bullets of Scene 3's `What happens:` into Scene 4 (and update Scene 4's `Where and when:`).

---

#### Chapter 33 — Mikhail's Offer

- **Exact file paths:**
  - Draft: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/draft/33-mikhails-offer.md`
  - Scene cards: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/outline/scenes/33-mikhails-offer.md`
- **Scene cards (`outline/scenes/33-mikhails-offer.md`):**
  - **`## Scene 1 – The coat in the heat` (lines 11–22):**
    - `What happens:` ends with `- He leaves the secure phone in the coat's zipped pocket and carries the coat over his arm through the wet heat to the station hotel.`
    - `Ends on:` (line 22): `the inside of his elbow growing wet under the coat.`
  - **`## Scene 2 – No technicians` (lines 24–35):**
    - `What happens:` ends with `- Mikhail puts the cardboard folder between them. "First another business."`
    - `Ends on:` (line 35): `“First another business.”`
  - **`## Scene 3 – The framework` (lines 37–47):**
    - `What happens:` (lines 41–44):
      - `- Eight clipped pages, no logo: **SUPPLY AND TECHNICAL SUPPORT FRAMEWORK — DRAFT**.`
      - `- Mikhail offers direct work after Aoi: three times the volume over two years, four-month reservation, thirty-day payment from a European trade bank, no Aoi intermediary.`
      - `- Export control: "All documents required." "Like Aoi." "Aoi documents brought you here twice." "Police did not stop shipment."`
      - `- Jim says no to unnamed customers after Aoi.`
    - `Ends on:` (line 46): `"Then you manufactured." The cooling unit restarting.`
  - **`## Scene 4 – Sacrificed without consequence` (lines 49–65):**
    - `What happens:` (lines 54–60):
      - `- Mikhail knows the German side asked Jim to go on, and guesses Jim's phone "is not only telephone". He called Jim directly to learn whether Jim answers. "You answer."`
      - `- Why a small firm suits everyone: if a large German company appears in a Russian power system, ministers answer questions; if a twenty-eight-person firm makes a wrong export, customs opens a file and the paper photographs the building.`
      - `- "Large company is protected. Small company can be sacrificed without political consequence."`
      - `- Mikhail's offer of protection: European company, civil power contracts, clean documents, payment before shipment, technical annex kept separate.`
      - `- And if German officials ask later? "You show file." "A file prepared by you." "A file prepared properly."`
      - `- Mikhail asks whether German officials gave Jim a guarantee in writing that Heller Controls will not be prosecuted. "A reference number is a folder."`
      - `- Petrov's shadow crosses the wired glass.`
    - `Ends on:` (line 64): `Petrov's shadow passing the wired glass.`
  - **`## Scene 5 – The folder` (lines 67–80):**
    - `What happens:` starts with `- Tomorrow: Onega Air, 10:30, a representative rack in the rear room; after the update, Mori signs the service completion sheet and Aoi's balance is released.` (line 72).
    - `Ends on:` (line 80): `the station clock visible from the hotel steps.`
- **Where `***` currently sits in `draft/33-mikhails-offer.md`:**
  - **Break 1 (Scene 1 → Scene 2): Supabase line 52** (between local disk lines 50 and 52) — *Clean match*:
    ```markdown
    48: I left the secure telephone in the zipped pocket and carried the coat over my arm.
    49: 
    50: On the walk to the meeting hotel near the station, the coat grew heavier as the inside of my elbow became wet.
    51: 
    52: ***
    53: 
    54: Petrov waited near reception. He wore the navy airline blazer despite the heat.
    ```
  - **Break 2 (Scene 2 → Scene 3): Supabase line 152** (between local disk lines 148 and 150) — *Clean match*:
    ```markdown
    148: He moved the cardboard folder between us.
    149: 
    150: “First another business.”
    151: 
    152: ***
    153: 
    154: The folder contained eight pages clipped at the upper left. The first had no logo.
    ```
  - **Break 3 (Scene 3 → Scene 4): Supabase line 304** (between local disk lines 298 and 300) — *MAIN DISCREPANCY*:
    ```markdown
    # Note: Scene 4's FIRST `What happens:` bullet ("Mikhail knows the German side asked Jim to go on... 'You answer.'")
    # actually appears 70 lines EARLIER in the draft at Supabase lines 232–254 (disk lines 228–250):
    232: “You know the Germans let it continue.”
    ...
    252: “Whether I answer.”
    253: 
    254: “You answer.”
    255: 
    256: He opened the folder again and turned to the third page.
    ...
    # Then Scene 3's final bullet ("No to unnamed customers...") is at Supabase lines 276–286 (disk lines 272–282),
    # followed by Scene 3's `Ends on:` and Break 3 at Supabase lines 300–316 (disk lines 296–310):
    300: “Then you manufactured.”
    301: 
    302: The cooling unit restarted. Air moved across the table, lifting the last page against his fingers.
    303: 
    304: ***
    305: 
    306: “At the request of German officials,” I said.
    307: 
    308: “Yes.”
    309: 
    310: “They know you are here.”
    311: 
    312: “They know you are in Tokyo.”
    313: 
    314: The lifted corner of the page tapped once against the table. Mikhail moved the pages away from it.
    315: 
    316: “German officials value your help,” he said. “Have they told you what happens after?”
    ```
  - **Break 4 (Scene 4 → Scene 5): Supabase line 400** (between local disk lines 392 and 394) — *SECONDARY DISCREPANCY*:
    ```markdown
    396: “You answer quickly when important people call,” he said.
    397: 
    398: Petrov’s shadow crossed the wired glass beside the door and moved away.
    399: 
    400: ***
    401: 
    402: “Who was that?”
    403: 
    404: “A person waiting for answer.”
    405: 
    406: “Did you give one?”
    407: 
    408: “Enough for now.”
    409: 
    410: Mikhail checked the time.
    411: 
    412: “The service session is tomorrow at Onega Air, ten thirty,” he said.
    ```
- **Discrepancy & What the Author Needs to Decide:**
  1. **Break 3 (Scene 3 → Scene 4):**
     - In `draft/33-mikhails-offer.md`, the beat listed as Scene 4's first `What happens:` bullet (`Mikhail knows the German side asked Jim to go on, and guesses Jim's phone "is not only telephone"... "You answer."`, disk lines 228–250) occurs **in the middle of Scene 3**, before Mikhail reopens the contract folder at disk line 252 and before Jim says `"No to unnamed customers..."` (disk line 282) and `"Then you manufactured."` (disk line 296).
     - Furthermore, placing `***` right after `The cooling unit restarted...` (disk line 298 / Supabase line 304) splits a direct two-line dialogue exchange: `"Then you manufactured."` / `"At the request of German officials," I said.`
     - **Author decision for Break 3:**
       - **Option A:** Move `***` 6 lines later to after disk line 310 (`The lifted corner of the page tapped once against the table. Mikhail moved the pages away from it.`, right before `“German officials value your help,” he said.`), update Scene 3's `Ends on:` accordingly, and move Scene 4's first `What happens:` bullet into Scene 3 in `outline/scenes/33-mikhails-offer.md`.
       - **Option B:** Keep `***` at Supabase line 304 (matching Scene 3's current `Ends on:`), and move Scene 4's first `What happens:` bullet into Scene 3 in `outline/scenes/33-mikhails-offer.md`.
       - **Option C:** Move `***` earlier to after disk line 222 (`I closed the draft.`) so Scene 4 begins when Mikhail pivots from the pages to the Germans (`"You did not want to come in March," he said.`), and move the remaining contract-rejection beat (disk lines 252–310) into Scene 4.
  2. **Break 4 (Scene 4 → Scene 5):**
     - `***` at Supabase line 400 matches Scene 4's `Ends on:` (`Petrov's shadow passing the wired glass.`, disk line 392), which puts the 4-line exchange about Petrov (`"Who was that?" / "A person waiting for answer." / "Did you give one?" / "Enough for now."`, disk lines 394–400) at the top of Scene 5 before `Mikhail checked the time.` (disk line 402).
     - **Author decision for Break 4:** Either keep `***` at Supabase line 400 (and optionally note the `"Who was that?"` exchange in Scene 5's card), or move `***` 4 lines later to after `“Enough for now.”` (disk line 400) and update Scene 4's `Ends on:` to `“Enough for now.”`

---

#### Chapter 35 — The Weapon

- **Exact file paths:**
  - Draft: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/draft/35-the-weapon.md`
  - Scene cards: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/outline/scenes/35-the-weapon.md`
- **Scene cards (`outline/scenes/35-the-weapon.md`):**
  - **`## Scene 1 – Diverted` (lines 11–18):**
    - `What happens:` (lines 15–16):
      - `- At a long light Petrov gets a brief call; at the next junction he turns away from the expressway to an industrial clinic ("Wait ten minutes. Less trouble than road").`
      - `- Nishimura under the only tree with her wallet and a short, thick parcel in faded blue cloth. "Bring the coat."`
    - `Ends on:` (line 17): `Nishimura seeing Jim look at the parcel.`
  - **`## Scene 2 – The assessment` (lines 20–32):**
    - `What happens:` (lines 25–29):
      - `- Nishimura locks the door, checks Jim's coat pocket (only the secure phone), sets the cloth parcel on the changing table.`
      - `- "Change of assessment." Two men associated with the northern logistics group entered the Onega Air building before eight; Mikhail is upstairs; a vehicle is in the loading bay with engine running.`
      - `- "You think they will keep the module." "Or you."`
      - `- Her section has two observers outside, no authority to enter before an offence is visible. The request for a response team "will not clear before eleven fifteen". The German side will not postpone.`
      - `- "I requested support." "It was refused." "It was not answered in time."`
    - `Ends on:` (line 31): `the red pull cord turning slowly above the floor, though no air reaches it.`
  - **`## Scene 3 – The cloth` (lines 34–51):**
    - `What happens:` (lines 39–46):
      - `- She unwraps the cloth: a compact pistol, matte black, worn at the slide edges, no markings.`
      - `- Jim refuses it (`"No"`). He knows how to shoot ("Targets. Paper. Twenty-five meters. With ear protection and a range officer behind me"). "Take the module instead." "If you arrive without the module, they know immediately."`
      - `- Why she gives him a gun: "Two men are inside. Our team is forty minutes behind your entry."`
      - `- He asks where it came from ("Not from an inventory that will be read in court"), what happens at the door (no metal detector, Petrov won't search the coat he already carried), what happens if he uses it ("Stay alive until our people enter. Do not leave the building with it").`
      - `- He makes her clear it; she shows the empty chamber and magazine ("Eight"), re-inserts the magazine without chambering a round, wraps it in the blue cloth and puts it in his right coat pocket. The coat hangs lower on that side.`
      - `- "You are pleased." "I prefer that you are not empty-handed while my request is in a queue."`
      - `- He puts the coat on despite the heat so Petrov doesn't take it.`
      - `- Instructions: report entry; report if moved below the thirty-first floor; the emergency phrase ("The calibration certificate is missing from the shipment") if contact fails. "And if they take the telephone?" "Then leave when you can." "With the module." "With yourself."`
    - `Lines that matter:` (line 48): `"You are pleased."; "With yourself."`
    - `Ends on:` (line 51): `Nishimura pushing the last blue cloth ends into the pocket with one finger.`
  - **`## Scene 4 – The washroom at the tower` (lines 53–68):**
    - `Where and when:` `Petrov's car; Shinagawa Seishin Tower, thirty-first floor, a narrow washroom before the suite.`
    - `What happens:` starts with `- Outside, the parcel is gone; Jim is wearing the coat. Petrov: "You wear coat now." "Wait for lift."` (line 58).
    - `Ends on:` (line 68): `Jim leaving the pistol in the blue cloth behind the access panel...`
- **Where `***` currently sits in `draft/35-the-weapon.md`:**
  - **Break 1 (Scene 1 → Scene 2): Supabase line 30** (between local disk lines 28 and 30):
    ```markdown
    26: She saw me looking at it.
    27: 
    28: “Bring the coat,” she said.
    29: 
    30: ***
    31: 
    32: Beyond a public waiting room with an electric fan, she led me into an accessible toilet with a changing table, a folding rail, a low basin, and a pull cord reaching almost to the floor. The room smelled of disinfectant and hot pipes. She locked the door.
    ```
  - **Break 2 (Scene 2 → Scene 3): Supabase line 112** (between local disk lines 108 and 110):
    ```markdown
    # Note: Scene 2's `Ends on:` ("the red pull cord turning slowly...") is at Supabase line 96 (disk line 94):
    94: “Why not?”
    95: 
    96: “Because the request for a response team will not clear before eleven fifteen.” She looked at the locked door, then back at me. The red pull cord hung beside her shoulder, its plastic triangle turning slowly above the floor though no air reached it.
    97: 
    98: “Then postpone the service.”
    ...
    108: “It was refused.”
    109: 
    110: “It was not answered in time.”
    111: 
    112: ***
    113: 
    114: She unwrapped the cloth.
    115: 
    116: The pistol lay inside with the grip towards her.
    ```
  - **Break 3 (Scene 3 → Scene 4): Supabase line 280** (between local disk lines 274 and 276):
    ```markdown
    # Note: Scene 3's `Ends on:` ("Nishimura pushing the last blue cloth ends...") is at Supabase line 262 (disk line 258):
    262: I put the coat on. The wool was still warm from the car and smelled faintly of the dry-cleaning bag from Germany. With the coat on, the pull of the right pocket was less visible, though I felt the hard corner against my thigh each time I shifted my weight. Nishimura adjusted the cloth with one finger so the blue ends did not show.
    263: 
    264: “Send the entry message when you pass the lobby,” she said. “If they move you to another floor or a vehicle, send the floor number or direction before you enter the lift.”
    ...
    276: “With the module.”
    277: 
    278: “With yourself.”
    279: 
    280: ***
    281: 
    282: Outside, Petrov looked at the dark wool, then at Nishimura. She held the transparent wallet with both hands. The parcel was gone.
    283: 
    284: “You wear coat now,” he said.
    ```
- **Discrepancy & What the Author Needs to Decide:**
  - In all three scene transitions in Chapter 35, the `***` breaks in Supabase (lines 30, 112, 280) sit at the natural narrative boundaries matching `What happens:`. However, all three scene cards (Scenes 1, 2, and 3) in `outline/scenes/35-the-weapon.md` have `Ends on:` lines that describe a physical image beat occurring **earlier** than the closing dialogue bullets of that same scene (`She saw me looking at it.` at disk line 26 before `"Bring the coat."` at disk line 28; `the red pull cord turning slowly...` at disk line 94 before `"It was not answered in time."` at disk line 108; `Nishimura pushing the last blue cloth ends...` at disk line 258 before `"With yourself."` at disk line 274).
  - **Author decision:**
    1. **Option A (keep all three `***` breaks at Supabase lines 30, 112, 280):** Update `Ends on:` in `outline/scenes/35-the-weapon.md` for Scene 1 (line 17 → `“Bring the coat.”`), Scene 2 (line 31 → `“It was not answered in time.”`), and Scene 3 (line 51 → `“With yourself.”`).
    2. **Option B (if the physical image beats were intended to close Scenes 1–3):** Reorder the image sentences in `draft/35-the-weapon.md` to follow those dialogue lines, or move the `***` breaks to those earlier lines and shift the trailing dialogue bullets into the next scene cards.

---

#### Chapter 36 — Onega Air

- **Exact file paths:**
  - Draft: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/draft/36-onega-air.md`
  - Scene cards: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/outline/scenes/36-onega-air.md`
- **Scene cards (`outline/scenes/36-onega-air.md`):**
  - **`## Scene 1 – The rear corridor` (lines 11–18):**
    - `Ends on:` (line 18): `the carpet changing to gray tiles beyond the fire door.`
  - **`## Scene 2 – The back room` (lines 20–29):**
    - `Ends on:` (line 29): `“I asked for destination documents.”`
  - **`## Scene 3 – The photographs` (lines 31–45):**
    - `What happens:` (lines 35–40):
      - `- The cargo-administration woman brings two binders and a flat envelope.`
      - `- First binder: Aoi assembly sheets and Mori's inspection tables with blue fountain-pen corrections.`
      - `- Second binder: waybills via Vladivostok and a northern rail terminal, customer fields coded (`**NORTHERN INDUSTRIAL POWER / CONTRACT 14-B**`, `**MOBILE AUXILIARY SYSTEMS / SECTOR NORTH**`).`
      - `- The envelope: three photographs without text — a shelter container on a heavy multi-axle chassis on wet concrete; an interior rack with Heller Controls' source-transfer controller and their pale grey locking bars in Russian-marked framing; a fenced compound under low cloud with a radar mast and two mobile shelters.`
      - `- Mikhail: "Mobile power and switching container" for northern sites without stable grid. Jim points to the mast: "And the mast?" "Customer site has other equipment."`
      - `- Tanaka: "Aoi prepares shipping documents." Mikhail: "Kenji-san understood some routes." Jim: he asked whether the controller would fail safely. "Mr. Mori's question is not part of update."`
    - `Lines that matter:` (line 42): `"It turns mobile air defense into mobile power."`
    - `Ends on:` (line 45): `Mori's blue handwriting showing once more before the binder cover closes.`
  - **`## Scene 4 – The release record` (lines 47–60):**
    - `What happens:` (lines 52–56):
      - `- Petrov's annex lists only "mobile power support" and "protected government power", codes without a key.`
      - `- Why show the photographs if the record omits them? "Because final update requires you understand consequence of refusing." For the installed controllers there is no other manufacturer.`
      - `- Jim cuts the red custody label. Petrov writes `**SEAL BROKEN BY J. HELLER — TOKYO — SERVICE SESSION**` and signs as witness.`
      - `- Mikhail leaves the release record beside the laptop for Jim's signature after the update.`
    - `Ends on:` (line 60): `the broad man moving his hand toward the module and stopping when Jim looks at him. “Manufacturer.”`
  - **`## Scene 5 – Installed` (lines 62–78):**
    - `What happens:` starts with `- Tanaka opens the center enclosure; warm cable-insulation air.` (line 67).
- **Where `***` currently sits in `draft/36-onega-air.md`:**
  - **Break 1 (Scene 1 → Scene 2): Supabase line 28** (between local disk lines 26 and 28) — *Clean match*:
    ```markdown
    26: At the rear of the suite, a fire door stood open onto a second corridor. I had thought the office ended before it. The air beyond was colder, and the carpet changed to square gray tiles.
    27: 
    28: ***
    29: 
    30: Petrov used a key on the final door.
    ```
  - **Break 2 (Scene 2 → Scene 3): Supabase line 42** (between local disk lines 38 and 40) — *Clean match*:
    ```markdown
    38: The rack carried no remote communications case. A small display on the right showed only local status blocks. None contained a place name.
    39: 
    40: “I asked for destination documents,” I said.
    41: 
    42: ***
    43: 
    44: The woman from cargo administration entered several minutes later carrying two binders and a flat envelope.
    ```
  - **Break 3 (Scene 3 → Scene 4): Supabase line 228** (between local disk lines 222 and 224) — *MAIN DISCREPANCY*:
    ```markdown
    # In the draft, Petrov's release record annex (Scene 4 What happens bullets 1 & 2) starts at Supabase line 198 (disk line 194),
    # BEFORE Scene 3's `Lines that matter:` (Supabase line 208 / disk line 204) and Scene 3's `Ends on:` (Supabase line 226 / disk line 222):
    194: The woman gathered the shipping forms. Her chipped index nail lifted each lower corner without smudging Mori’s blue corrections.
    195: 
    196: “You have seen,” Mikhail said.
    197: 
    198: Petrov placed the single-sheet annex from the table folder beside the binders. It was titled **SYSTEM-INTERFACE AND SERVICE RELEASE RECORD**.
    ...
    208: “It turns mobile air defense into mobile power.”
    ...
    224: “There is no other manufacturer.”
    225: 
    226: The woman placed the photographs back into the flat envelope, the mobile shelter first. Mori’s blue handwriting showed once more before the binder cover closed.
    227: 
    228: ***
    229: 
    230: I removed the clear pouch from the service bag and placed it on the steel surface. The red custody label had not lifted at any edge. The module inside looked smaller beside the demonstration rack than it had between Reuter and Kern in Erfurt.
    231: 
    232: Petrov gave me the scissors.
    ```
  - **Break 4 (Scene 4 → Scene 5): Supabase line 264** (between local disk lines 254 and 256) — *Clean match*:
    ```markdown
    258: The broad representative moved his hand towards it and stopped when I looked at him.
    259: 
    260: “Manufacturer,” he said.
    261: 
    262: “Yes.”
    263: 
    264: ***
    265: 
    266: Tanaka opened the center enclosure. Warm air came from the rack and carried the smell of cable insulation.
    ```
- **Discrepancy & What the Author Needs to Decide:**
  - In `outline/scenes/36-onega-air.md`, Scene 4 (`## Scene 4 – The release record`) lists Petrov placing the single-sheet annex (`SYSTEM-INTERFACE AND SERVICE RELEASE RECORD`, disk line 196) and the exchange `"Why show me the photographs if the record omits them?" ... "There is no other manufacturer."` (disk lines 208–220) as its first two `What happens:` bullets. However, in `draft/36-onega-air.md`, those lines occur **before** Scene 3's `Lines that matter:` (`"It turns mobile air defense into mobile power."`, disk line 204) and **before** Scene 3's `Ends on:` (`Mori's blue handwriting showed once more before the binder cover closed.`, disk line 222 / Supabase line 226).
  - **Author decision for Break 3:**
    1. **Option A (keep `***` at Supabase line 228, after disk line 222):** In `outline/scenes/36-onega-air.md`, move the first two bullets of Scene 4's `What happens:` (lines 53–54) into Scene 3's `What happens:` so Scene 4 begins when Jim takes the sealed pouch from his service bag and Petrov hands him the scissors.
    2. **Option B (move `***` earlier to after disk line 194, `“You have seen,” Mikhail said.`):** So Scene 4 (`## Scene 4 – The release record`) begins at disk line 196 (`Petrov placed the single-sheet annex from the table folder beside the binders...`), update Scene 3's `Ends on:` to `“You have seen,” Mikhail said.` (or the woman gathering the shipping forms at disk line 190), and move `"It turns mobile air defense into mobile power."` and the closing of the binder into Scene 4's card.

---

#### Chapter 42 — Debriefing

- **Exact file paths:**
  - Draft: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/draft/42-debriefing.md`
  - Scene cards: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/outline/scenes/42-debriefing.md`
- **Scene cards (`outline/scenes/42-debriefing.md`):**
  - **`## Scene 1 – The chronology` (lines 11–26):**
    - `Ends on:` (line 26): `Jim writing “Yes” on the back of the Japanese property receipt under the case number.`
  - **`## Scene 2 – Successful` (lines 28–45):**
    - `What happens:` last bullet (line 39): `- Kern alone: a sheet slips, a gray block over the heading, Jim's surname beneath. “Is it observation?” / “Anna answered that.” “I am not read into present use.” / “A laboratory capability.” Jim sees the three enclosures and the load turning amber.`
    - `Ends on:` (line 44): `Kern's word “A laboratory capability.”`
  - **`## Scene 3 – The expense form` (lines 47–62):**
    - `Where and when:` `travel administration, a room across the corridor.`
    - `What happens:` starts with `- A date stamp; a tray for rail, hotel, local transport, other.` (line 52).
    - `Ends on:` (line 62): `the clerk stamping RECEIVED across the hotel invoice.`
- **Where `***` currently sits in `draft/42-debriefing.md`:**
  - **Break 1 (Scene 1 → Scene 2): Supabase line 94** (between local disk lines 92 and 94) — *Clean match*:
    ```markdown
    90: “Yes.”
    91: 
    92: The word was plain enough that I wrote it on the back of the Japanese property receipt, beneath the case number.
    93: 
    94: ***
    95: 
    96: After two hours, Vogt moved the unused water glass in front of him. A wet circle was left on the table though he had not drunk from it.
    ```
  - **Break 2 (Scene 2 → Scene 3): Supabase line 192** (between local disk lines 188 and 190) — *MAIN DISCREPANCY*:
    ```markdown
    186: “I am not read into present use,” he said.
    187: 
    188: “A laboratory capability.”
    189: 
    190: I saw the three enclosures again, the drawn load turning amber.
    191: 
    192: ***
    193: 
    194: Reuter opened the door. Travel administration needed the receipts before I left.
    195: 
    196: The woman with the green identity cord worked in a room across the corridor. Her desk held a date stamp and a tray divided into compartments for rail, hotel, local transport, and other.
    ```
- **Discrepancy & What the Author Needs to Decide:**
  - Scene 2's `Ends on:` says `Kern's word “A laboratory capability.”` (disk line 186 / Supabase line 188), whereas Scene 2's `What happens:` includes `Jim sees the three enclosures and the load turning amber.` (disk line 188 / Supabase line 190, where `***` currently sits at Supabase line 192). Immediately after `***` is the transitional sentence `Reuter opened the door. Travel administration needed the receipts before I left.` (disk line 190 / Supabase line 194), before Jim enters the room across the corridor at disk line 192 (`The woman with the green identity cord worked in a room across the corridor.`).
  - **Author decision for Break 2:**
    1. **Option A (keep `***` at Supabase line 192, after `I saw the three enclosures again, the drawn load turning amber.`):** Update Scene 2's `Ends on:` in `outline/scenes/42-debriefing.md` (line 44) to `the three enclosures and the drawn load turning amber.`
    2. **Option B (move `***` one paragraph later, to after `Reuter opened the door. Travel administration needed the receipts before I left.`, disk line 190):** So Scene 3 (`Where and when: travel administration, a room across the corridor`) opens directly inside that room (`The woman with the green identity cord worked in a room across the corridor.`), and update Scene 2's `Ends on:`.
    3. **Option C (move `***` one paragraph earlier, to after `“A laboratory capability.”`, disk line 186):** Match Scene 2's current `Ends on:` literally.

---

#### Chapter 44 — The Outage

- **Exact file paths:**
  - Draft: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/draft/44-the-outage.md`
  - Scene cards: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/outline/scenes/44-the-outage.md`
- **Scene cards (`outline/scenes/44-the-outage.md`):**
  - **`## Scene 1 – The brief notice` (lines 11–20):**
    - `Ends on:` (line 20): `waiting for the board's green capacitor light to go dark before placing it in the passed tray.`
  - **`## Scene 2 – “Could it be?”` (lines 22–34):**
    - `Where and when:` `the small office at home, that evening and night; the bedroom drawer.`
    - `What happens:` (lines 27–31):
      - `- Public broadcaster notification: **Substation fire leaves parts of northern port and industrial district without power.**`
      - `- Sabine reads over his shoulder: “You were in Russia?” “No. Japan.” “Could it be?” “Yes.”`
      - `- Later reports add civilian effects, including a hospital that moved patients; the accounts keep changing.`
      - `- He charges the secure telephone (under the green shooting record), types a message to AR and deletes it before sending.`
    - `Ends on:` (line 34): `the telephone charging on the floor.`
  - **`## Scene 3 – The times` (lines 36–44):**
    - `Where and when:` `the factory, the following days.`
    - `What happens:` (lines 40–42):
      - `- Jim notes the conflicting reported times on the back of a test sheet; they do not agree with each other.`
      - `- Niko: “These are not test times.” He puts the sheet in the confidential-waste tray without asking and pushes it down with two fingers.`
      - `- The obsolete agricultural housings wait under the line, one turned to show the empty space where the wrong connector would have fitted.`
    - `Ends on:` (line 43): `the sheet pushed down out of sight.`
  - **`## Scene 4 – The white strip` (lines 46–61):**
    - `Where and when:` `Jim's factory office, the fourth day.`
    - `What happens:` starts with `- A regional emergency-service account posts photographs from a damaged site; one shows an open cabinet from too far away to read.` (line 51).
    - `Ends on:` (line 61): `deleting the image file, emptying the trash, and still seeing the pale strip.`
- **Where `***` currently sits in `draft/44-the-outage.md`:**
  - **Break 1 (Scene 1 → Scene 2): Supabase line 28** (between local disk lines 26 and 28) — *Clean match*:
    ```markdown
    26: Its green status light stayed on after I disconnected the service cable because the fixture’s capacitor held its charge. I waited for it to go dark before putting the board in the passed tray.
    27: 
    28: ***
    29: 
    30: The next report came that evening.
    ```
  - **Break 2 (Scene 2 → Scene 3): Supabase line 108** (between local disk lines 104 and 106) — *Matches Scene 2 `Ends on:`*:
    ```markdown
    104: I typed a message to AR, then erased it before sending.
    105: 
    106: I left the telephone charging on the floor because the cable would not reach the bedside table.
    107: 
    108: ***
    109: 
    110: In the morning the hospital notice was gone.
    ```
  - **Break 3 (Scene 3 → Scene 4): Supabase line 136** (between local disk lines 130 and 132) — *MAIN DISCREPANCY*:
    ```markdown
    132: He looked at the rows on the back, then put the sheet into the confidential-waste tray without asking.
    133: 
    134: The page stayed at an angle against the other travelers, the penciled times visible through the slot until Niko pushed it down with two fingers. He returned to the fixture and placed the next board in the passed tray. Beneath the end of the line, the agricultural housings with the obsolete opening still waited in their carton. One had been turned on its side, showing the clean rectangular space where the wrong connector would have fitted.
    135: 
    136: ***
    137: 
    138: For three days, the reports changed at their edges. Residential power returned first, according to the regional administration. A trade paper wrote that an industrial substation had suffered an internal protection failure during load transfer. An English-language summary blamed deferred maintenance and winter salt, though the month was August. The port authority reported no interruption to scheduled movements and cancelled two coastal departures the same afternoon.
    139: 
    140: No public page used the name BND. None used Heller Controls, Onega Air, or Aoi Electric. When I searched the model number of our controller, the results were our own datasheet, an old trade-fair listing, and a cached Aoi supplier page that showed no product.
    141: 
    142: On the fourth day, a regional emergency-service account posted twelve photographs from the distribution site.
    ```
- **Discrepancy & What the Author Needs to Decide:**
  1. **Inside disk line 130 (Supabase line 134):** Scene 3's `Ends on:` (`the sheet pushed down out of sight.`) is the first sentence of the paragraph (`...until Niko pushed it down with two fingers.`), whereas Scene 3's third `What happens:` bullet (`Beneath the end of the line, the agricultural housings...`) is the second half of that **same paragraph**.
  2. **Disk lines 132–134 (`For three days, the reports changed at their edges...` and `No public page used the name BND...`):** Currently `***` is at Supabase line 136 (before `For three days...`), which places the three-day summary at the start of Scene 4 (`Where and when: Jim's factory office, the fourth day`), two paragraphs before `On the fourth day, a regional emergency-service account posted twelve photographs from the distribution site.` (disk line 136 / Supabase line 142).
  - **Author decision for Break 3:**
    1. **Option A (move `***` two paragraphs later to after disk line 134, `...a cached Aoi supplier page that showed no product.`):** So `For three days, the reports changed at their edges...` stays in Scene 3 (`Where and when: the factory, the following days`), Scene 4 (`the fourth day`) opens cleanly with `On the fourth day, a regional emergency-service account posted twelve photographs from the distribution site.`, and update Scene 3's `What happens:` and `Ends on:` in `outline/scenes/44-the-outage.md`.
    2. **Option B (keep `***` at Supabase line 136, after disk line 130 `...where the wrong connector would have fitted.`):** Update Scene 3's `Ends on:` in `outline/scenes/44-the-outage.md` (line 43) from `the sheet pushed down out of sight.` to `the clean rectangular space where the wrong connector would have fitted.`

---

#### Chapter 49 — Green Lights

- **Exact file paths:**
  - Draft: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/draft/49-green-lights.md`
  - Scene cards: `/Users/dominik/Development/writing/thin-place-press/books/dubois/cold-solder/outline/scenes/49-green-lights.md`
- **Scene cards (`outline/scenes/49-green-lights.md`):**
  - **`## Scene 1 – The empty rack` (lines 11–23):**
    - `What happens:` (lines 14–18):
      - `- Early at the factory; snow along the sill; the benchmark room cold. The calibration box is gone from the floor; the blue-marked terminal blocks sit in the lower drawer in a closed bag.`
      - `- Jim turns the main switch on the test rack, closes the source simulator, leaves the load bank at zero.`
      - `- He hangs his wet wool coat on the door hook — the right pocket still hangs slightly lower from the summer's weight.`
      - `- Mains amber, then five green lights, the last appearing while he looks away. No product connected; the fixture plate holds four screws and a dark rectangle. The manual sequence closes the rack's own relays in repeat mode; one relay sounds lower (armature touching before it holds); its label's date code is the year they built the rack.`
      - `- The Sarykol quotation on the test computer, **PRELIMINARY** watermark, unchanged. Niko's prospect note: **No production review. Hold pending management and export decision.** (Jim told him to use the sentence whenever an inquiry arrived with more money than address.) Eva entered the paid report as an administrative cost to his office, added the registration extract, approved no credit limit.`
    - `Ends on:` (line 22): `the telephone face up beneath the monitor showing no notification.`
  - **`## Scene 2 – The quotation sent before the report` (lines 25–43):**
    - `What happens:` (lines 30–37):
      - `- He moves the marking condition (**Product, manufacturer and origin presentation subject to written classification and applicable German requirements.**) from the last page to the first.`
      - `- He opens the reply draft: thanks Sarykol; the product “appeared” compatible (he deletes “broadly”); attaches the preliminary quotation.`
      - `- The building heating starts; the radiator in Eva's office releases water.`
      - `- He deletes the sentence waiting for the external compliance report before sending the quotation.`
      - `- He adds the line requiring end-user certificate, site identification, and final technical release before order acceptance or production scheduling, and leaves the standard forty-percent advance after compliance clearance.`
      - `- He checks the bank details, attaches the PDF, and sends it to Alma-Ata (`**Message sent**`).`
      - `- He prints a copy for the Sarykol folder, writes the date and time in pencil in the upper corner, and files it in the locked export cabinet on the upper shelf beside Aoi and the old Russian refrigeration folder, putting an empty ring binder between Sarykol and Aoi so it stands upright.`
    - `Ends on:` (line 42): `the empty ring binder propped between Sarykol and Aoi.`
  - **`## Scene 3 – Twenty-three cycles` (lines 45–57):**
    - `What happens:` starts with `- The rack has completed twenty-three cycles; the lower relay still makes its double sound; faint warmth on the front panel.` (line 50).
    - `Ends on:` (line 56): `“All five status lights were green.”`
- **Where `***` currently sits in `draft/49-green-lights.md`:**
  - **Break 1 (Scene 1 → Scene 2): Supabase line 60** (between local disk lines 58 and 60) — *MAIN DISCREPANCY*:
    ```markdown
    # In the draft, Scene 2's first `What happens:` bullet (moving the marking condition from the last page to the first)
    # occurs at Supabase lines 42–46 (disk lines 42–46), BEFORE the relay date-code paragraph (lines 48–50)
    # and BEFORE Scene 1's `Ends on:` (the telephone beneath the monitor, lines 52–58):
    40: Eva had entered the paid report as an administrative cost against my office. She had added the registration extract to the folder and left the credit-limit field blank. When I asked her the previous afternoon whether she wanted to close the inquiry, she had looked at the blank field and said that a blank field was already a decision. She had not approved a credit limit.
    41: 
    42: I read the five pages.
    43: 
    44: On the final page, above the signature block, stood the sentence I had added the day before:
    45: 
    46: **Product, manufacturer and origin presentation subject to written classification and applicable German requirements.**
    47: 
    48: I cut the sentence from the last page and placed it on the first, beneath the system description.
    49: 
    50: Behind me, the relay bank changed over and released. After ten seconds it began the cycle again. One of the relays had a lower sound than the others, a small double click as the armature touched before it held. I had heard it for a month without opening the housing.
    51: 
    52: I went back to the rack and opened the side door. The relay bank sat behind a clear guard. The lower sound came from the third unit in the row. Its label showed a date code from the year we built the rack. I closed the guard without touching it.
    53: 
    54: On the bench, my telephone lay beside the keyboard.
    55: 
    56: The screen showed the time and no notification. The secure application was still installed. Its icon sat on the second page, where it did not appear when the telephone was opened on a table. I unlocked the screen, looked at the icon, and did not open it.
    57: 
    58: The message field was empty. I had not drafted a sentence at home. The agreement required me to preserve and report a later approach.
    59: 
    60: I placed the telephone face up beneath the monitor.
    61: 
    62: ***
    63: 
    64: The building heating began. Pipes struck once above the corridor. The radiator in Eva’s office released water with the sound of a tap opened in another room. My coat had stiffened at the shoulders where melted snow had darkened it.
    65: 
    66: The Sarykol message had asked whether we could provide an assessment in five business days. Twenty-five hours had passed.
    67: 
    68: I opened the reply draft.
    ```
  - **Break 2 (Scene 2 → Scene 3): Supabase line 122** (between local disk lines 118 and 120) — *Clean match*:
    ```markdown
    118: The printer’s heater filled the office with the smell of warm paper.
    119: 
    120: I carried the folder to the locked export cabinet. On the upper shelf, beside the Aoi file, lay the thinner folder for the old Russian refrigeration work through the German machine builder. I put Sarykol on the same shelf. The clear folder would not stand upright. It leaned against Aoi until I moved an empty ring binder between them.
    121: 
    122: ***
    123: 
    124: The rack had completed twenty-three cycles. The lower relay continued to make its double sound. A faint warmth had spread across the front panel, strongest above the source module and the old power supply. I placed both hands on the metal edge.
    ```
- **Discrepancy & What the Author Needs to Decide:**
  - In `draft/49-green-lights.md`, the prose interleaves Scene 1 and Scene 2 beats:
    1. Disk lines 34–40: He opens the Sarykol quotation, reads Niko's prospect note and Eva's blank credit-limit entry (Scene 1 Bullet 5).
    2. **Disk lines 42–48:** He reads the five pages and moves `**Product, manufacturer and origin presentation subject to written classification and applicable German requirements.**` from the last page to the first (listed in `outline/scenes/49-green-lights.md` as **Scene 2 Bullet 1**!).
    3. **Disk lines 50–52:** The relay bank cycles in repeat mode; one relay makes a lower double click; its label shows a date code from the year they built the rack (listed in `outline/scenes/49-green-lights.md` as the second half of **Scene 1 Bullet 4**!).
    4. **Disk lines 54–60:** He checks the telephone on the bench and places it face up beneath the monitor (Scene 1 `Ends on:`), where `***` currently sits at Supabase line 60.
  - **Author decision for Break 1:**
    1. **Option A (keep `***` at Supabase line 60, after `I placed the telephone face up beneath the monitor.`):** In `outline/scenes/49-green-lights.md`, move Scene 2's first `What happens:` bullet (`He moves the marking condition ... from the last page to the first.`) into Scene 1's `What happens:`, so Scene 2 begins with the building heating starting and Jim opening the reply draft (`The building heating began... I opened the reply draft.`).
    2. **Option B (move `***` earlier to after disk line 40, `She had not approved a credit limit.`):** If Scene 2 should begin when Jim edits the five-page quotation (`I read the five pages.`), move `***` to after disk line 40 (or reorder paragraphs 42–48 and 50–60 in `draft/49-green-lights.md` so the relay inspection and the telephone check precede `I read the five pages.`).

---

## 2. Known Issue #14: Bookkit CLI Parity (`/Users/dominik/Development/writing/bookkit`)

### 2.1 `book start N` (`drafts.py` / `cli.py`) vs. Website `startChapterContent(..., sceneHeadings)`

#### How the Website Lays Out a New Chapter
1. **`/Users/dominik/Development/personal/writer/src/components/studio/ManuscriptView.tsx` (lines 146–157):**
   - When the user clicks **"Write this chapter"** on an unstarted chapter whose outline twin is `reference`, the website looks up `outline/scenes/<reference.filename>` in the project files, parses all `## ` scene headings via `parseScenes(scenesFile).map(c => c.heading)` (`src/lib/scene-cards.ts:29–58`), and passes them to `startChapterContent(reference.content, model.config, headings)`.
2. **`/Users/dominik/Development/personal/writer/src/lib/book-model.ts` (lines 382–408):**
   ```ts
   export function startChapterContent(outlineContent: string, config?: BookConfig | null, sceneHeadings: string[] = []): string {
     const parsed = parseFrontMatter(outlineContent);
     const allowed = new Set([
       ...(config?.manuscript?.front_matter?.required ?? []),
       ...(config?.manuscript?.front_matter?.optional ?? []),
     ]);
     const fm: Record<string, unknown> = {};
     for (const [k, v] of Object.entries(parsed.data)) {
       if (k === "draft_budget_words" && ! (config?.manuscript?.front_matter?.required ?? []).includes(k)) continue;
       if (allowed.size === 0 || allowed.has(k) || k === "status") fm[k] = v;
     }
     fm.status = "drafting";
     const lines = parsed.body.replace(/^\n+/, "").split("\n");
     const h1 = lines.find(l => /^#\s+Chapter\s+\d+\b/.test(l)) ?? lines[0] ?? "# Chapter";
     const yamlOut = YAML.stringify(fm).trimEnd();
     const scaffold = sceneHeadings.length < 2 ? "" : config?.manuscript?.scenes
       ? sceneHeadings.map(h => `## ${h}\n\n`).join("")
       : Array(sceneHeadings.length - 1).fill("***\n\n").join("");
     return `---\n${yamlOut}\n---\n\n${h1}\n\n${scaffold}`;
   }
   ```
   - **Behavior when `sceneHeadings.length >= 2`:**
     - If `config.manuscript.scenes === true`: lays out explicit `## Scene N – Title\n\n` headings for each scene card in `outline/scenes/<chapter>.md`. *(Note: When `config.manuscript.scenes === true` and a chapter has 1 scene card, `companion.py:392` still requires `len(cards) == len(chapter.scenes)`, so when `config.manuscript.scenes` is `True`, scaffolding even a single scene heading if `len(cards) >= 1` is also worth considering.)*
     - If `config.manuscript.scenes === false` (the default): lays out `len(sceneHeadings) - 1` horizontal-rule scene breaks (`***\n\n`).

#### How the Bookkit CLI Currently Behaves
1. **`/Users/dominik/Development/writing/bookkit/bookkit/drafts.py` (lines 315–360):**
   ```python
   def start(config: BookConfig, number: int) -> Path:
   ```
   - Reads the outline twin (`outline/chapters/NN-slug.md`), filters front matter to `manuscript.front_matter.required` + `optional` (dropping `draft_budget_words` unless required), sets `status = "drafting"`, extracts the `# Chapter N` H1 line, and writes:
     ```python
     target.write_text(f"---\n{front}\n---\n\n{h1}\n\n", encoding="utf-8")
     ```
   - It **never** inspects `outline/scenes/<twin.path.name>` and has no option to scaffold scenes (`## Scene N – Title` or `***`).
2. **`/Users/dominik/Development/writing/bookkit/bookkit/cli.py` (lines 293–301, 497–502):**
   - `cmd_start(args)` calls `drafts_module.start(config, args.chapter)`.
   - The `start` subparser only accepts positional `chapter: int`.

#### Exact CLI Changes Recommended for `book start N`
- In `/Users/dominik/Development/writing/bookkit/bookkit/drafts.py:315`:
  - Update signature to `def start(config: BookConfig, number: int, *, scenes: bool = False) -> Path:` (or `scenes: bool = True` with `--no-scenes`, or `--scenes` flag on `book start N`).
  - When `scenes=True`:
    - Check `cards_path = config.root / companion_module.SCENES_DIR / twin.path.name`.
    - If `cards_path.is_file()`, parse front matter via `parse_front_matter(cards_path)` and extract scene headings via `cards = [m.group(0).strip() for m in companion_module.SCENE_CARD.finditer(cards_body)]`.
    - If `len(cards) >= 2`:
      - If `config.manuscript.scenes`: `scaffold = "".join(f"{heading}\n\n" for heading in cards)`
      - Else: `scaffold = "***\n\n" * (len(cards) - 1)`
    - Write `f"---\n{front}\n---\n\n{h1}\n\n{scaffold}"`.
- In `/Users/dominik/Development/writing/bookkit/bookkit/cli.py:293–301, 497–502`:
  - Add `--scenes` (`action="store_true"`, help="Lay out the new chapter in its scenes from outline/scenes/ (`## Scene N` headings or `***` breaks).") to the `start` subparser and pass `scenes=args.scenes` in `cmd_start`.

---

### 2.2 How `kind`, `byline`, and `style` in `book.yaml` Are Parsed and Used Across `bookkit`

#### Inspection of All Python Modules in `/Users/dominik/Development/writing/bookkit/bookkit/`
- **`config.py`:**
  - `StyleConfig` dataclass (`config.py:108–126`):
    - Fields: `inherit: str = "own"`, `spelling: str | None = None`, `serial_comma: bool | None = None`, `quotes: str | None = None`, `punctuation_in_quotes: str | None = None`, `dashes: str | None = None`, `ellipsis: str | None = None`, `numbers: str | None = None`, `manual: str | None = None`.
  - `BookConfig` dataclass (`config.py:248–270`):
    - `kind: str = "fiction"` (`config.py:262`)
    - `byline: str = "own-name"` (`config.py:263`)
    - `style: StyleConfig = field(default_factory=StyleConfig)` (`config.py:264`)
    - `@property def pen_name(self) -> bool: return self.byline == "pen-name"` (`config.py:267–270`)
  - `_load_kind(raw)` (`config.py:656–676`):
    - Reads top-level `kind` (`fiction` | `nonfiction`), falls back to `companion.kind`, defaults to `"fiction"`, and raises `ConfigError` if both are present and disagree.
    - Passed into `_load_companion(raw.get("companion"), kind)` at `config.py:855`.
  - `_load_byline(raw)` (`config.py:730–743`):
    - Validates `own-name` | `pen-name` (defaults to `"own-name"`).
  - `_load_style(raw, lint)` (`config.py:679–727`):
    - Validates `STYLE_CHOICES` (`inherit`, `spelling`, `quotes`, `punctuation_in_quotes`, `dashes`, `ellipsis`, `numbers`, `manual`) and `serial_comma: bool`.
    - At `config.py:719–726`:
      ```python
      if style.spelling:
          declared = [name for name in SPELLING_STYLES.values() if name in lint.vale.styles]
          wanted = SPELLING_STYLES.get(style.spelling)
          if declared and declared != ([wanted] if wanted else []):
              raise ConfigError(
                  f"`style.spelling` is {style.spelling}, but `lint.vale.styles` runs "
                  f"{', '.join(declared)}. Make them agree."
              )
      ```

#### Specific Audit Question 1: Does `lint.py` auto-derive Vale spelling style (`AmericanSpelling` / `OxfordSpelling`) from `style.spelling` or only check for contradiction?
- **Answer: It ONLY checks for contradiction in `config.py:719–726` — `lint.py` does NOT auto-derive or enable `AmericanSpelling` or `OxfordSpelling` from `style.spelling`!**
- **Exact file/line references and failure modes:**
  1. **`config.py:719–726` only checks when `declared` is non-empty:**
     - `declared = [name for name in SPELLING_STYLES.values() if name in lint.vale.styles]`
     - `if declared and declared != ([wanted] if wanted else []): raise ConfigError(...)`
     - If a book sets `style.spelling: american` or `style.spelling: oxford` in `book.yaml`, and `lint.vale.styles` is left at its default `("ManuscriptCore", "Vale")` or `[ManuscriptCore, Prose, Vale]` (without explicitly listing `AmericanSpelling` or `OxfordSpelling`), `declared` is `[]`. `config.py` does **not** raise an error and does **not** append `wanted` (`AmericanSpelling` or `OxfordSpelling`) to `lint.vale.styles`!
  2. **`lint.py:60–92` (`materialise_vale`) ignores `config.style` completely:**
     - `materialise_vale(config)` only iterates `for style_name in config.lint.vale.styles:` (`lint.py:62`) and checks `if style_name == "Vale":` (`lint.py:64`) to toggle `Vale.Spelling = NO` when `not config.lint.vale.spelling`.
     - It never reads `config.style.spelling` (or any other field on `config.style`).
  3. **Website `newBookFiles` + `updateConfig` interaction makes this bug happen by default on new books:**
     - When the website creates a new book (`src/lib/supabase-service.ts:1937–1957`), it writes `style:` (e.g., `spelling: oxford` or `spelling: american` inherited from the shelf) into `book.yaml` with **no `lint:` section at all**.
     - And in `src/lib/book-config.ts:175`, `updateConfig()` only updates `lint.vale.styles` `if (spelling && d.hasIn(["lint", "vale", "styles"]))`.
     - Consequently, any new book created via the Studio with `style.spelling: american` or `style.spelling: oxford` runs `book lint` with only `("ManuscriptCore", "Vale")` — **neither `AmericanSpelling` nor `OxfordSpelling` is active!**
  4. **`OxfordSpelling` vs. built-in `Vale.Spelling` conflict (`lint.py:64–67`):**
     - `styles/vale/OxfordSpelling/Spelling.yml` uses `extends: spelling` with `dic: en_GB-ize`.
     - Built-in `Vale.Spelling` checks US English (`en_US`). That is why `matthis/the-lords-prayer/book.yaml:41` had to manually set `lint.vale.spelling: false # OxfordSpelling checks against en_GB-ize instead`.
     - If `style.spelling` is `"oxford"` (or `"british"`) and `lint.vale.spelling` is left at its default `True`, `Vale.Spelling` remains enabled and flags British/Oxford `-our` / `-re` / `-ll-` words as spelling errors!
  5. **Other `config.style` fields vs. `lint.py` / `ManuscriptCore/Typography.yml`:**
     - `styles/vale/ManuscriptCore/Typography.yml` (`lines 1–9`) hardcodes regexes flagging straight quotes (`"`, `'`), `--`, and `\.\.\.`.
     - If `config.style.ellipsis == "dots"` (`...`), `ManuscriptCore.Typography` flags `...` as an error!
     - `lint.py` has no check enforcing `config.style.quotes` (`double` vs `single`) or `config.style.dashes` (`em-closed` vs `en-spaced` vs `none`) or `config.style.ellipsis` (`character` vs `dots`).

#### Specific Audit Question 2: Does `build.py` / `render.py` (or `metadata.py`) use `byline`, `kind`, or `style`?
- **Answer: NO. Neither `build.py`, `render.py`, nor `metadata.py` reads `config.byline`, `config.pen_name`, `config.kind`, or `config.style` anywhere.**
- **Exact file/line references and what is missing:**
  1. **`render.py:114–150` (`publish_text`) ignores `config.style.quotes` (and `config.style.dashes` / `ellipsis`):**
     - `publish_text(text)` is called across `render.py` on chapter headings, subtitles, part headings, title pages, copyright pages, and front/back matter (`render.py:67, 175, 189, 208, 216, 240–280`).
     - At `render.py:128–150`, `publish_text` unconditionally normalizes German `„…“`, guillemets `«…»`, and straight `"` into curly **double** quotes (`“…”`), with no parameter or check for `config.style.quotes == "single"`.
     - Likewise, `render.py` and `build.py` never normalize or check body-text quote style (`double` vs `single`), dash style (`em-closed` `—` vs `en-spaced` ` – `), or ellipsis style (`character` `…` vs `dots` `...`) against `config.style`.
  2. **`build.py` (`lines 256–327` `check`, `lines 330–408` `build`) and `metadata.py` (`lines 23–160`) ignore `config.byline` (`config.pen_name`) and `config.author`:**
     - `book.yaml` declares `author`, `title`, `subtitle`, `language`, and `byline: own-name | pen-name` (`config.pen_name`), while `publication/metadata.yaml` independently declares `author`, `title`, `subtitle`, `language`, and `rights_holder` (`metadata.py:25–34`).
     - `build.py:256` (`book publish --check`) never checks whether `publication/metadata.yaml` agrees with `book.yaml` (`config.title`, `config.author`, `config.language`), nor does it check `config.byline` / `config.pen_name` (for example, when `byline: own-name`, `rights_holder` and `author` normally match `config.author`; when `byline: pen-name`, `metadata.author` must match the pen name `config.author` rather than leaking an unconfigured name, or `publication/metadata.yaml` can inherit defaults from `config` when fields are omitted).
  3. **`cli.py:328` (`cmd_humanize_report`) and `companion.py:519` bypass top-level `config.kind`:**
     - `cli.py:328`: `kind = config.companion.kind if config.companion is not None else "fiction"`
     - `companion.py:519`: `kind = config.companion.kind if config.companion else "fiction"`
     - Both ignore `config.kind` when a nonfiction book has top-level `kind: nonfiction` in `book.yaml` without a `companion:` block! Because `config._load_kind` (`config.py:656–676`) already reconciles top-level `kind` and `companion.kind` into `config.kind`, both lines should simply use `config.kind`.

#### Summary of Recommended CLI Parity Improvements (`bookkit`)
1. **`drafts.py` & `cli.py` (`book start N`):** Add `--scenes` (`scenes: bool = False` or auto when `outline/scenes/` exists) to scaffold `## Scene N – Title` headings (when `config.manuscript.scenes` is true) or `***` scene breaks (when `config.manuscript.scenes` is false) from `outline/scenes/<chapter>.md`, matching `startChapterContent` in `src/lib/book-model.ts:382–408`.
2. **`config.py` & `lint.py` (`style.spelling` → Vale):**
   - In `_load_style` / `_load_lint` (`config.py:719–726`) and/or `materialise_vale` (`lint.py:60–92`), automatically include `AmericanSpelling` when `style.spelling == "american"` and `OxfordSpelling` when `style.spelling == "oxford"` if not already listed in `lint.vale.styles`.
   - When `style.spelling in ("oxford", "british")` (or `"OxfordSpelling" in styles`), automatically disable built-in US `Vale.Spelling` (`Vale.Spelling = NO` in the generated `.vale.ini`) so US `Vale.Spelling` does not fight `en_GB-ize`.
3. **`lint.py` / `render.py` (`config.style` typography):**
   - Respect `config.style.ellipsis`, `config.style.quotes`, and `config.style.dashes` in `lint.py` (so `style.ellipsis: dots` is not flagged as an error by `ManuscriptCore.Typography`, and mismatched dash/quote styles are caught) and pass `config.style` into `render.py` (`publish_text`).
4. **`build.py` / `metadata.py` (`byline` & `author` / `title` consistency):**
   - In `build.check()` (`build.py:256`), validate `publication/metadata.yaml` against `config.title`, `config.author`, `config.language`, and `config.byline` (`own-name` vs `pen-name`).
5. **`cli.py:328` & `companion.py:519` (`config.kind`):**
   - Replace `config.companion.kind if config.companion is not None else "fiction"` with `config.kind`.

---

## 3. Known Issue #10: Included AI Models on Workers AI

### 3.1 Current Configuration and Call Flow in the Codebase

#### Exact Model IDs and Constants
1. **`/Users/dominik/Development/personal/writer/worker/index.ts` (lines 6–12, 247):**
   ```ts
   export const INCLUDED_MODELS=[
    {id:'@cf/moonshotai/kimi-k2.6',label:'Kimi K2.6 (included)'},
    {id:'@cf/zai-org/glm-5.3',label:'GLM 5.3 (included)'},
    {id:'@cf/deepseek-ai/deepseek-v4-pro-0813',label:'DeepSeek V4 Pro (included)'},
    {id:'@cf/openai/gpt-oss-120b',label:'gpt-oss 120B (included)'},
   ];
   export const INCLUDED_PROMPT_LIMIT=90000;
   ...
   export const POLISH_MODEL='@cf/openai/gpt-oss-120b';
   ```
2. **`/Users/dominik/Development/personal/writer/src/lib/llm-service.ts` (lines 5–12):**
   ```ts
   export const INCLUDED_DEFAULT_MODEL='@cf/moonshotai/kimi-k2.6';

   export function effectiveProvider(settings:AISettings):{provider:AIProvider;model:string}{
     const p=settings.selectedProvider;
     if(p==='anthropic'&&settings.anthropicKey.trim())return{provider:'anthropic',model:settings.selectedModel};
     if(p==='openai'&&settings.openaiKey.trim())return{provider:'openai',model:settings.selectedModel};
     return{provider:'bookkit',model:p==='bookkit'&&settings.selectedModel.startsWith('@cf/')?settings.selectedModel:INCLUDED_DEFAULT_MODEL};
   }
   ```

#### How the Models Are Called
1. **Main LLM endpoint (`POST /api/ai/complete` → `included()` in `worker/index.ts:35–50`):**
   - Authenticates the user via Supabase Bearer token (`authenticate()`).
   - Selects `model = INCLUDED_MODELS.some(m => m.id === body.model) ? body.model! : INCLUDED_MODELS[0].id` (defaults to `@cf/moonshotai/kimi-k2.6`).
   - Enforces `INCLUDED_PROMPT_LIMIT = 90000` characters (~22k–25k tokens).
   - Fetches the project's `book.yaml` from `bookkit_documents` via `bookPolicy()` (`worker/index.ts:66–81`) to verify that the requested `mode` (`companion`, `humanize`, `review`, `proofread`, `notes`) is permitted by `ai_policy` (`assisted`, `strict`, `hands_off`, etc.) and injects the corresponding system prompt (`POLICY_SYSTEM`).
   - Sets `max = body.mode === 'companion' ? 16384 : 4096`.
   - Calls Cloudflare Workers AI binding directly:
     ```ts
     const data = await env.AI.run(model, {
       messages: [
         { role: 'system', content: policy },
         { role: 'user', content: body.prompt },
       ],
       max_tokens: max,
     }) as ...;
     ```
   - Checks `choice?.finish_reason && choice.finish_reason !== 'stop'` (returns HTTP 422 if truncated) and strips `<think>[\s\S]*?<\/think>` blocks before returning `{ text, model, provider: 'bookkit' }`.
2. **Voice dictation punctuation polish (`POST /api/voice/transcribe` in `worker/index.ts:247, 291–300`):**
   - After Whisper transcription (`@cf/openai/whisper-large-v3-turbo`), if `text.length < 6000`, calls `env.AI.run(POLISH_MODEL, ...)` (`@cf/openai/gpt-oss-120b`) with `temperature: 0` to add punctuation, capitalization, and paragraph breaks, strictly gated by `onlyPunctuationChanged(text, candidate)` so the model can never alter or hallucinate words.

---

### 3.2 Critical Operational Alert: November 20, 2026 Cloudflare Deprecation Deadline

> **URGENT FINDING:** According to the Cloudflare Workers AI Changelog (*"Planned model deprecations on Workers AI"*), **two of the four currently configured models — including the default model `@cf/moonshotai/kimi-k2.6` — are scheduled to be shut off on November 20, 2026 (11 days from today):**
> - **`@cf/moonshotai/kimi-k2.6`** (currently `INCLUDED_DEFAULT_MODEL` in `src/lib/llm-service.ts:5` and `INCLUDED_MODELS[0]` in `worker/index.ts:7`) → **Deprecated effective November 20, 2026.**
> - **`@cf/deepseek-ai/deepseek-v4-pro-0813`** (currently `INCLUDED_MODELS[2]` in `worker/index.ts:9`) → **Deprecated effective November 20, 2026** (superseded in the DeepSeek line by `@cf/deepseek-ai/deepseek-v4.1-flash-1017`).
> - Starting **November 20, 2026**, requests to `@cf/moonshotai/kimi-k2.6` and `@cf/deepseek-ai/deepseek-v4-pro-0813` on Workers AI will fail with **HTTP 410 Gone (error code 5028)**. Because `@cf/moonshotai/kimi-k2.6` is the fallback default whenever a user has no API key or an unrecognized model ID, **all default included-AI requests will break on November 20, 2026 unless `INCLUDED_DEFAULT_MODEL` and `INCLUDED_MODELS` are updated.**

---

### 3.3 Privacy & Data-Handling Posture on Cloudflare Workers AI

Because all `@cf/...` models run on **Cloudflare's own serverless GPU infrastructure** via the `env.AI` binding (and **not** via API calls to Moonshot, Zhipu/Z.ai, DeepSeek, or OpenAI servers):
1. **No Data Sent to Model Creators:** Prompts and manuscript text sent to `env.AI.run('@cf/...')` are processed exclusively on Cloudflare's network and **never leave Cloudflare to reach servers in China (Moonshot, Z.ai, DeepSeek) or OpenAI/Meta/Mistral/Google**.
2. **Zero Data Retention (ZDR) & No Model Training:** Under Cloudflare's Workers AI Data Privacy & Governance commitment:
   - Cloudflare **does not use Customer Content** (prompts, manuscript text, voice audio, or outputs) to train, fine-tune, or improve any AI models.
   - Standard stateless `env.AI.run()` inference follows **Zero Data Retention (ZDR)**: inputs and outputs are held in memory only for the duration of the inference request and are discarded immediately after the response is returned.
   - Customer data is isolated per request and never shared across customers.
   - *(Caveat: ZDR holds as long as the Worker does not route requests through Cloudflare AI Gateway with persistent request/response logging/caching enabled, and does not `console.log` prompt bodies. Currently `worker/index.ts` calls `env.AI.run` directly without AI Gateway logging and does not log prompt contents, so ZDR is preserved.)*
3. **Why Provenance Still Matters Even with Cloudflare Hosting:**
   - **Regulatory & sanctions compliance:** Zhipu AI (Beijing Knowledge Atlas Technology Co., Ltd. / Z.ai, developer of GLM) was placed on the **US Department of Commerce Bureau of Industry and Security (BIS) Entity List** in January 2025. While running open-weight model checkpoints hosted by Cloudflare does not transmit data or funds directly to Zhipu AI, enterprise/institutional customers and western authors often object to or have compliance policies against models developed by BIS Entity List organizations.
   - **Editorial bias, censorship, and alignment:** Models trained and RLHF-aligned under PRC Generative AI regulations (`Kimi`, `GLM`, `DeepSeek`) carry built-in alignment constraints and stylistic/editorial tendencies on sensitive political, historical, or geopolitical topics (which is directly relevant to books like *Cold Solder* dealing with intelligence agencies, Russia, China/Asia, and export controls).
   - **Author trust & optics:** Authors entrusting unpublished manuscripts to Thin Place Press / Bookkit Studio see the model names in the UI dropdown (`Kimi K2.6`, `GLM 5.3`, `DeepSeek V4 Pro`, `gpt-oss 120B`). Featuring three Chinese lab models as the top three options (and the default) raises immediate trust questions for privacy-conscious western/EU authors, even when Cloudflare hosts the weights.

---

### 3.4 Comprehensive Comparison Table: Current Included Models vs. Western / EU / Open-Weight Alternatives on Workers AI

| Model ID on Workers AI | Developer & Origin | Architecture & Context Window | Open-Weight License | Workers AI Status (Nov 2026) | Approx. Workers AI Pricing (per 1M tokens) | Editorial & Compliance Assessment for Bookkit |
|---|---|---|---|---|---|---|
| **CURRENTLY CONFIGURED IN `worker/index.ts`** | | | | | | |
| `@cf/moonshotai/kimi-k2.6` *(current default)* | **Moonshot AI** (Beijing Moonshot Technology, **China**) | MoE (~1T total / ~32B active), 128k–256k ctx | Modified MIT License (attribution required for large commercial scale) | **DEPRECATED — shuts off Nov 20, 2026 (HTTP 410 / err 5028)** | ~$0.95 in / ~$4.00 out | Strong long-context prose/coding, but **will stop working Nov 20, 2026**, expensive output tokens ($4/1M), PRC alignment/optics as default model. **Must remove before Nov 20.** |
| `@cf/zai-org/glm-5.3` | **Z.ai / Zhipu AI** (Beijing Knowledge Atlas Technology, **China**) | Frontier MoE reasoning/instruct, 128k ctx | Open-weight (MIT / GLM license) | **Active** (Cloudflare frontier replacement for GLM 5.2) | ~$0.15–$0.30 in / ~$0.50–$1.00 out | Capable multilingual/structured model, but developer (Zhipu AI) is on the **US BIS Entity List**, plus PRC alignment constraints. **Recommend removing or keeping only as optional non-default.** |
| `@cf/deepseek-ai/deepseek-v4-pro-0813` | **DeepSeek** (Hangzhou DeepSeek AI, **China**) | MoE reasoning/instruct, 128k ctx | MIT License | **DEPRECATED — shuts off Nov 20, 2026 (HTTP 410 / err 5028)** (replaced by `deepseek-v4.1-flash-1017`) | ~$0.30–$1.32 in / ~$1.00–$3.96 out | Emits `<think>` blocks (which consume part of `max_tokens` before prose output), PRC alignment, and **this checkpoint shuts off Nov 20, 2026**. **Must remove before Nov 20.** |
| `@cf/openai/gpt-oss-120b` *(also `POLISH_MODEL`)* | **OpenAI** (San Francisco, **USA**) | MoE (117B total / ~5.1B active params), 128k ctx | **Apache 2.0** (true permissive OSI open-weight) | **Active** (flagship US open-weight model on Workers AI) | ~$0.35 in / ~$0.75 out | **Excellent choice.** True Apache 2.0 open-weight, US origin, fast active-parameter MoE inference, low cost ($0.35/$0.75), already proven in `worker/index.ts` as `POLISH_MODEL`. **Should be promoted to `INCLUDED_DEFAULT_MODEL`.** |
| **WESTERN / EU / OPEN-WEIGHT ALTERNATIVES ON WORKERS AI** | | | | | | |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | **Meta AI** (Menlo Park, **USA**) | Dense 70B (FP8 fast-quantized), 128k ctx | **Llama 3.3 Community License** (open-weight; free commercial use under 700M MAU) | **Active** (GA, production workhorse) | ~$0.29 in / ~$2.00 out | **Best prose & literary instruction-following among dense open models.** No `<think>` token burn, strong English/European prose sensibility, fast FP8 execution on Cloudflare. |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | **Mistral AI** (Paris, **France / EU**) | Dense 24B Instruct, 128k ctx | **Apache 2.0** (true permissive OSI open-weight) | **Active** (GA) | ~$0.35 in / ~$0.56 out | **Best EU-origin & Apache 2.0 option.** Developed in France (GDPR-native culture), strong English/French/German literary and editorial quality, very low output cost ($0.56/1M), zero reasoning-token overhead. |
| `@cf/google/gemma-4-26b-a4b-it` *(or `@cf/google/gemma-3-12b-it`)* | **Google DeepMind** (**USA / UK**) | MoE 26B total / 4B active (`gemma-4-26b-a4b-it`) or Dense 12B (`gemma-3-12b-it`), 128k ctx | **Gemma Terms of Use** (open-weight commercial license) | **Active** (Cloudflare's recommended 2026 replacement model) | ~$0.10–$0.20 in / ~$0.30–$0.50 out | High prose naturalness and very fast/inexpensive inference; great lightweight western companion/review option. |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | **Meta AI** (**USA**) | MoE (109B total / 17B active, 16 experts), 128k+ ctx | **Llama 4 Community License** | **Active** | ~$0.27 in / ~$0.85 out | Fast MoE alternative to Llama 3.3 70B with lower output cost ($0.85/1M vs $2.00/1M) and large context capacity. |
| `@cf/deepseek-ai/deepseek-v4.1-flash-1017` *(or `@cf/qwen/qwen3.8-27b`)* | **DeepSeek** / **Alibaba Qwen** (**China**) | MoE / Dense 27B, 128k ctx | MIT / Apache 2.0 | **Active** (Cloudflare's Nov 2026 replacements) | ~$0.15–$0.30 in / ~$0.50–$1.00 out | Only if the owner specifically wants to keep one frontier Chinese open-weight model in the list after Nov 20, 2026. |

---

### 3.5 Recommendations for the Owner (Known Issue #10)

1. **Immediate Action Before November 20, 2026 (Prevent Outage):**
   - Remove `@cf/moonshotai/kimi-k2.6` and `@cf/deepseek-ai/deepseek-v4-pro-0813` from `INCLUDED_MODELS` in `worker/index.ts:6–11` and change `INCLUDED_DEFAULT_MODEL` in `src/lib/llm-service.ts:5` before **November 20, 2026**, when Cloudflare will begin returning **HTTP 410 Gone (error 5028)** for both models.
2. **Switch the Default Included Model to `@cf/openai/gpt-oss-120b` (or `@cf/meta/llama-3.3-70b-instruct-fp8-fast`):**
   - `@cf/openai/gpt-oss-120b` is already in `INCLUDED_MODELS` and is already trusted as `POLISH_MODEL` (`worker/index.ts:247`). It is US-origin (OpenAI), **Apache 2.0 licensed**, active on Workers AI, and costs ~5x less on output tokens ($0.75/1M) than `kimi-k2.6` ($4.00/1M).
3. **Recommended Curated `INCLUDED_MODELS` Lineup (Western / EU / Open-Weight First):**
   - **Option 1 — 100% Western / EU Open-Weight Lineup (Recommended for clearest author trust, compliance, and prose quality):**
     1. `@cf/openai/gpt-oss-120b` — **gpt-oss 120B (included, default)** *(OpenAI, US, Apache 2.0, 128k ctx — strong reasoning & structured companion/review output)*
     2. `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — **Llama 3.3 70B (included)** *(Meta, US, Llama 3.3 License, 128k ctx — strong literary/editorial prose sensibility, no `<think>` token burn)*
     3. `@cf/mistralai/mistral-small-3.1-24b-instruct` — **Mistral Small 3.1 24B (included)** *(Mistral AI, France/EU, Apache 2.0, 128k ctx — EU-origin, strong English/German/French editorial sensibility)*
     4. `@cf/google/gemma-4-26b-a4b-it` (or `@cf/meta/llama-4-scout-17b-16e-instruct`) — **Gemma 4 26B / Llama 4 Scout (included)** *(Google/Meta, US/UK, fast MoE, 128k ctx)*
   - **Option 2 — Hybrid Lineup (if the owner still wants one frontier Chinese model available alongside Western/EU defaults):**
     - Use `@cf/openai/gpt-oss-120b` (default), `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/mistralai/mistral-small-3.1-24b-instruct`, and either `@cf/deepseek-ai/deepseek-v4.1-flash-1017` or `@cf/zai-org/glm-5.3` as the fourth optional choice.
4. **Document the Privacy Guarantee in the UI (`AISettingsModal`):**
   - Add a concise note in the AI Settings UI explaining that included models run directly on Cloudflare Workers AI under **Zero Data Retention (ZDR)** — manuscript text is never used to train models and is never transmitted to third-party model creators.
