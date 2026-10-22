# Polyglot

[![Tests](https://github.com/1amaaaal/polygot/actions/workflows/test.yml/badge.svg)](https://github.com/1amaaaal/polygot/actions/workflows/test.yml)

**The daily guess-the-programming-language game.** Every day there's a new code snippet,
and you get six guesses to name the language.

**[▶ Play it here](https://1amaaaal.github.io/polygot/)**

![Polyglot screenshot](docs/screenshot.png)

## How it works

- You start with **3 lines** of code. Each wrong guess reveals **2 more**.
- Every guess is compared with the answer on five clues:

| Clue | Example values |
|---|---|
| **Paradigm** | Functional, Object-oriented, Procedural, Logic… |
| **Year** | When it first appeared. 🟨 means within 5 years, and the arrow points to the answer |
| **Typing** | Static, Dynamic, Untyped |
| **Runs as** | Native, VM, Interpreted, JIT, Transpiled |
| **Looks like** | C-like, Lisp, ML-like, Shell… |

- When you're done, share a spoiler-free result:

```
Polyglot #12 3/6

⬛🟨⬛🟩🟩
🟩⬛⬛🟩🟩
🟩🟩🟩🟩🟩
```

There are **35 languages** and **80 snippets**, from Python and Rust to COBOL, Prolog and
x86 Assembly.

## Features

The site has four sections, so the extras stay out of the way of the daily puzzle:

- **Today**: the daily puzzle, the same for everyone. Hard mode switches off syntax colours
  and makes every guess fit the clues so far.
- **Arcade**: endless mode (random snippets until you miss one), a 60-second speed run,
  practice rounds and the archive of past puzzles.
- **Leaderboard**: weekly boards for the daily puzzle, the speed run and endless mode. Sign in
  with GitHub to appear on them. While there are only a few players, the boards are topped up
  with bots, and they're labelled as bots.
- **Profile**: sign in with GitHub, your stats, 18 badges, the languages you've collected, and
  Polyglot Wrapped, a short year-in-review you can share.

Every answer comes with who created the language, a fact about it and a link to read more
(spot a mistake? every fact has a "report it" link). Results can be shared as an emoji grid,
an image card or a challenge link to the same snippet. It works offline, installs as an app,
and has a colour-blind mode, light and dark themes, and keyboard and screen-reader support.

Signing in is optional. Without it, everything stays in your browser. With it, your progress
syncs between devices and you appear on the leaderboard.

## Pages

| Page | What's there |
|---|---|
| `index.html` | Home |
| `play.html` | The game: daily, archive (`?day=`), challenge (`?c=`), practice and endless (`?mode=`) |
| `speed.html` | The speed run |
| `arcade.html` | The extra modes and the archive |
| `leaderboard.html` | This week's boards |
| `profile.html` | Stats, badges and the collection |
| `wrapped.html` | Polyglot Wrapped |
| `languages.html` | All 35 languages with their traits and facts, searchable |
| `help.html` | How to play |

## Run it locally

No build step and no dependencies: it's plain HTML, CSS and JavaScript.

```bash
git clone https://github.com/1amaaaal/polygot.git
cd polygot
npm start            # or: python3 -m http.server 8000
# open http://localhost:8000
```

## Tests

```bash
npm test                                     # game logic and snippet checks (Node 20+)

npm install --no-save playwright             # end-to-end test in a real browser
npx playwright install chromium
node tests/e2e/play.mjs http://localhost:8000/
```

The unit tests also check every snippet: that it names a known language, has 5 to 14
lines, and doesn't spell out its own language name.

## Contributing

The easiest way to help is to **add a snippet**. It's a few lines in a text file, with no
code changes needed. See [CONTRIBUTING.md](CONTRIBUTING.md).

## How the daily puzzle is chosen

No server is involved. Everyone's browser works out the same puzzle from the date, using a
seeded shuffle of the snippet list that never puts the same language on two days in a row.
New snippets are added to the end of the list, so past and current puzzles never change.
The details are in `src/game.js`.

The leaderboard bots work the same way: their results come from a seeded random generator
(`src/leaderboard.js`), so every visitor sees the same standings. Badges are defined in
`src/achievements.js`, each as a target for one number worked out from your saved progress.

## Design

The page is neutral, white or near-black, and one three-colour palette sits on top with one job
per colour: plum for the code snippet, periwinkle for what you've earned (collected languages,
Wrapped, the charts) and coral for what's running out (your last guess, the last ten seconds
of a speed run). Green, yellow and grey only ever appear on the clue board, and every clue is
readable without colour: a miss is grey, and a near miss always carries an arrow. The tokens
are at the top of `style.css`.

The interface uses [IBM Plex](https://github.com/IBM/plex) (SIL Open Font License), served
from `fonts/`: the sans for the interface and the mono for code. Icons are
[Phosphor](https://phosphoricons.com) (MIT), copied into `src/layout.js`.

## The server

Accounts, leaderboards and syncing use a [Supabase](https://supabase.com) project. The site
talks to it directly from the browser (`src/server.js`); what each visitor may read and write
is enforced by the database's row-level security, set up in `supabase/schema.sql`. Everything
else works without it, offline included.

To run your own copy:

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Create a GitHub OAuth app whose callback URL is your project's
   `https://<project>.supabase.co/auth/v1/callback`, and turn on the GitHub provider in
   Supabase with its client ID and secret.
3. Add your site's address to Supabase's redirect URLs.
4. Put your project URL and publishable key at the top of `src/server.js`.

## License

[MIT](LICENSE)
