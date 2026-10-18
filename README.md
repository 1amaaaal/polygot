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

- **Daily puzzle**, the same for everyone, plus unlimited **practice rounds**
- **Archive** 📅: replay any past puzzle you missed
- **Hard mode** 🔥: no syntax colours, and every guess must fit the clues so far
- **Challenge a friend** ⚔️: send a link to any snippet with your score attached
- **Share image**: a result card ready to post, as well as the classic emoji grid
- **Collection** 🧩: collect all 35 languages by solving them
- **Learn as you play**: who created each language, a fun fact and a link to read more
  (spot a mistake? every fact has a "report it" link)
- **Weekly leaderboard**: add your GitHub username and race a field of (clearly labelled) bots
- **Works offline**: installable as an app on your phone or computer
- **Colour-blind mode**, dark and light themes, and keyboard and screen-reader support

Everything (stats, streak, collection, username) is stored in your browser. There are no
accounts, no tracking and no server.

## Pages

| Page | What's there |
|---|---|
| `index.html` | Home: today's puzzle, features, profile and leaderboard |
| `play.html` | The game (daily, practice, challenges and archive puzzles) |
| `archive.html` | Every past puzzle, with your result for each |
| `collection.html` | The languages you've collected |
| `languages.html` | All 35 languages with their traits and facts, searchable |
| `help.html` | How to play, hard mode, challenges, installing the app |

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

There's no server. Everyone's browser works out the same puzzle from the date, using a
seeded shuffle of the snippet list that never puts the same language on two days in a row.
New snippets are added to the end of the list, so past and current puzzles never change.
The details are in `src/game.js`.

The leaderboard bots work the same way: their daily results come from a seeded random
generator (`src/leaderboard.js`), so every visitor sees the same standings.

## License

[MIT](LICENSE)
