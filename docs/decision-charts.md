# Album Bot decision charts

These charts match the [product requirements](prd.md). The [execution plan](execution-plan.md) is the demonstration order. The [tester walkthrough](tester-walkthrough.md) is how to check them. There was no earlier chart file in the kit. The November 17 drafts used tables with retired copy. Those choices are redrawn here.

## New bot, returning bot, and /start

```mermaid
flowchart TD
  arrive["A message arrives"] --> slash{"Does it start with a slash?"}
  slash -->|No| progress{"Is an album already in progress?"}
  progress -->|Yes| resume["Resume that album. Do not replay the opening"]
  progress -->|No| greet["A new bot presumes start. Greeting, then one new idea card"]
  slash -->|Yes| which{"Which command?"}
  which -->|"/start or /new"| fresh["Fresh album in its own folder. Keep the earlier album, takes, scores, and jobs"]
  which -->|"/help"| help["Say what Album Bot does, the next step, and the command list"]
  which -->|"/settings"| settings["Show Lite or Full and the open choices. Do not connect or generate"]
  which -->|"/listen"| listen["Rebuild the player for existing takes"]
  which -->|Other command| command["Do that command. Do not treat it as lyrics"]
  greet --> idea["Use a typed idea, a tapped idea, or Surprise me"]
  fresh --> idea
  idea --> chosen{"Did they already choose Lite or Full?"}
  chosen -->|Yes| names["Album title, then track titles"]
  chosen -->|No| path["How do you want to start?"]
  path --> names
```

Help and settings are available before a path is chosen. Neither one starts Suno.

## Lite or Full Setup

```mermaid
flowchart TD
  path["How do you want to start?"] --> lite["Album Bot Lite"]
  path --> full["Full Setup"]
  lite --> liteRules["No Cursor, GitHub, or Vercel. Grok Bot writes the prompts"]
  liteRules --> model{"Explicit or saved Suno model?"}
  model -->|Yes| useSaved["Use that model"]
  model -->|No| mini{"Does the account list v6-mini?"}
  mini -->|Yes| useMini["Use v6-mini"]
  mini -->|No| fallback["Use another verified eligible model within the approved cost"]
  full --> creative["Finish the brief and the track names"]
  creative --> cursor["Connect Cursor only if the comparison is starting"]
  cursor --> lineup["Name up to five models this project can run"]
  lineup --> edit{"Keep, swap, or use fewer?"}
  edit --> missing{"Can every chosen writer run?"}
  missing -->|Yes| preview["Preview prompt count, take count, and cost when it matters"]
  missing -->|No| replace["Offer a replacement. Do not credit the missing name"]
  replace --> preview
```

The Full Setup card copy is the five-model sentence. It does not offer a website or a 5–10 minute estimate. That time is said later, and only if a sign-in is required.

## Connections and fallback

```mermaid
flowchart TD
  need["A service is needed"] --> which{"Which service?"}
  which -->|Instructions| fetched{"Did the selected revision load?"}
  fetched -->|Yes| useRev["Use that playbook"]
  fetched -->|No| cache["Use the last complete cache. Do not invent a SHA"]
  which -->|Suno Free| browser["Signed-in suno.com browser. Do not add the connector"]
  which -->|Paid Suno| mcp["Official Suno connector when the account allows it"]
  browser --> balance{"Is the credit balance visible?"}
  mcp --> balance
  balance -->|Yes| silent["Check it silently. Mention it only when cost matters"]
  balance -->|No| unknown["Do not ask for a number. Try the agreed batch inside the limit"]
  unknown --> refused{"Does a later create get refused?"}
  silent --> refused
  refused -->|Yes| keep["Play the accepted takes. Never submit that job again"]
  refused -->|No| rest["Keep collecting the batch"]
  which -->|Cursor| ran{"Did the model return a prompt with provider, observed model, and execution id?"}
  ran -->|Yes| credit["Credit that observed model"]
  ran -->|No| nocredit["No credit. Offer a replacement or Lite"]
  which -->|Vercel or database| share{"Did they choose Share album, or ask for the full site?"}
  share -->|No| local["Stay on the local player"]
  share -->|Yes| own["Use the creator’s own account. Never Sasha’s"]
```

## First playable take, then the finished batch

```mermaid
flowchart TD
  clip["A Suno clip changes"] --> ready{"Did a ranged GET return 200 or 206 with video/mp4 or audio?"}
  ready -->|No| wait["Leave that clip pending. Keep polling the other ids"]
  ready -->|Yes| record["Record that clip. Do not wait for the others"]
  record --> first{"Is this the first playable take in the batch?"}
  first -->|Yes| sendFirst["Attach Open Album.html. Here’s your first take."]
  first -->|No| sendMore["Attach the same filename and name what is new"]
  sendFirst --> done{"Is every requested take in this batch playable?"}
  sendMore --> done
  done -->|No| watch["Do not show the completion card"]
  done -->|Yes| card["Phase ready, then offer: Your album is ready. What’s next?"]
```

The first playable song may be any track in the batch. A streaming status is not the gate. Aim to attach the file within ten seconds of the byte probe passing, while the other clip ids keep polling in the background. The exporter is already on disk before the first Create.

## Share album, Add more tracks, or a custom reply

```mermaid
flowchart TD
  card["Your album is ready. What’s next?"] --> reply{"What comes back?"}
  reply -->|No reply or later| listen["Leave the player open. Do not deploy"]
  reply -->|Bare yes| clarify["Ask which of the two actions they mean"]
  reply -->|Something else| custom["Follow the typed request. Do not assume a deploy"]
  reply -->|Share album or /share| edition{"Saved path?"}
  edition -->|Lite| static["Static HTML player on the creator’s Vercel project"]
  edition -->|Full Setup| app["Next.js app from the pinned kit revision and this album"]
  static --> check{"Does the public player open and play?"}
  app --> fullcheck{"Do /listen and /vote play signed out, and does /settings check out for the creator?"}
  check -->|Yes| link["Send the URL only when projectId and accountId are the creator’s"]
  fullcheck -->|Yes| link
  check -->|No| hold["Keep the local player and name the blocker"]
  fullcheck -->|No| hold
  reply -->|Add more tracks| append["New songs on this album. Keep takes, scores, and pass"]
  append --> again["Deliver the first new take, then show the card once when that batch finishes"]
```

`/more` makes more takes of a track that already exists. It is not Add more tracks.

## Voting passes and recovery

```mermaid
flowchart TD
  score["A take is scored"] --> where{"Which player?"}
  where -->|Attached HTML| listen["Listen page. It plays the album and does not show the pass control"]
  where -->|Served preview| file["Save .tmp/album-preview-ballot.json for this album"]
  where -->|Shared Full Setup site| site["Save this browser’s ballot, separate from the owner"]
  file --> next{"Next pass?"}
  site --> next
  next -->|No| stay["Keep the score on that take. Playback stays put"]
  next -->|Yes| cut{"Score for this pass"}
  cut -->|Negative| drop["Hide that take on the next pass"]
  cut -->|Positive| carry["Carry the score forward"]
  cut -->|Zero or unscored| remain["Leave it in the pass"]
  drop --> pass["Show the next pass number"]
  carry --> pass
  remain --> pass
  pass --> other{"A different album?"}
  other -->|Yes| clean["That album starts at pass 1 with its own votes"]
  other -->|No| same["This album keeps the new pass after reload"]
  job["An accepted Suno job is saved"] --> retry{"Resume or status check?"}
  retry --> read["Read the saved job. Do not create it again"]
```
