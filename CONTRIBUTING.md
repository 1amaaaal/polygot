# Contributing to Polyglot

Thanks for helping! Most contributions are new snippets, and those don't need any coding.

## Adding a snippet

1. Open `data/snippets.txt`.
2. Add your snippet at the **end of the file**, under a header line with the language name
   spelled exactly as it is in `data/languages.js`:

   ```
   =====[ Rust ]=====
   fn main() {
       let total: i32 = (1..=10).sum();
       println!("{}", total);
   }
   ```

3. Run `npm test`. It checks your snippet automatically.
4. Open a pull request.

### What makes a good snippet

- **5 to 14 lines.** The first 3 lines are all a player sees at first, so they should be
  a fair puzzle, not a giveaway.
- **No giveaways.** Don't include the language's name, file names like `main.rs`, shebang
  lines like `#!/bin/bash`, or opening tags like `<?php`.
- **Real, idiomatic code** that would actually run or compile, written by you rather than
  copied from somewhere else.
- **Varied.** A snippet that shows off a language's distinctive features (pattern
  matching, pipes, macros…) is more fun than another Hello World.

## Adding a language

1. Add an entry to `data/languages.js` with its first-release year and traits. Use only the
   values listed at the top of that file.
2. Add **at least two** snippets for it to `data/snippets.txt`.
3. Run `npm test`.

## Fixing a fact

If a language's year or traits are wrong, open an issue or a pull request with a source
(the language's official site or a reliable reference).

## Why snippets go at the end

The daily puzzle is a fixed shuffle of the first snippets in the file (see `SCHEDULE` in
`src/game.js`). Adding snippets to the end never changes past or current puzzles; they
appear in practice mode straight away. A maintainer brings them into the daily rotation by
adding a new `SCHEDULE` entry that starts on a future day.

## Code changes

- Keep it dependency-free: plain HTML, CSS and JavaScript, with no build step.
- Put game logic in `src/game.js` (pure functions, unit-tested). Each page has its own script
  (`src/play.js`, `src/speed.js`, …). `src/layout.js` holds the shared header, footer and
  settings, and `src/ui.js` the pieces the game pages share: the code panel, clue board and
  language picker.
- If you add, rename or remove a file the site loads, update the list in `sw.js` and bump its
  `CACHE` version. `npm test` checks that the list matches the files.
- Run `npm test`, and the end-to-end test in `tests/e2e/play.mjs` if you changed the UI.
