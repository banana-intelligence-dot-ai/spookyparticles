# Vercel "Module not found" error: why it happens and how to fix it

A Vercel build says "Module not found" when it cannot resolve an import. The usual cause is a file name whose capital letters differ from the import. Make them match, commit and redeploy. Spooky can pass the failing log line to your coding agent.

## Why does Vercel say "Module not found"?

Vercel's guide to [resolving a Module not found error](https://vercel.com/guides/how-do-i-resolve-a-module-not-found-error) lists the causes. Find the path in the build log, then check it against these, in order.

1. **The capital letters do not match.** Windows and macOS ignore case by default, so `./header` finds `Header.tsx` on your machine. The build runs on a case-sensitive Linux file system, so it does not. Compare the path in the log with the file name in your repository, letter by letter, make them match, commit and redeploy.
2. **Git never saw a rename that only changed case.** On a case-insensitive system Git can miss it, so Vercel still has the old name. Vercel's fix is to rename the file in two steps through a temporary name, for example `header.tsx` to `header-tmp.tsx` and then to `Header.tsx`, and commit both steps together. Vercel's guide suggests `git config core.ignorecase false` so Git notices case changes, though that does not repair a rename Git already missed.
3. **The package is missing.** If the import is a package name, check that it is listed in `package.json` and that the change is committed. A package installed only on your machine never reaches the build.
4. **The relative path is wrong.** Count the `../` segments against the folder the file really sits in. A path that works in your editor through a path alias can fail on a clean checkout.

## How do I find the failing import?

Open the failed deployment in the Vercel dashboard and read its build logs. The error names the import it could not find. Compare that path with the file name in your repository, character by character. A local build on Windows or macOS may not show a capital letter mismatch, so check it by eye, or build on a case-sensitive file system such as Linux. For more on reading the log, see [Vercel build failed](/vercel-build-failed) and [Vercel deployment failed](/vercel-deployment-failed).

## Why does the build pass on my machine but fail on Vercel?

Most often it is the capital letters. Windows and macOS treat `Header` and `header` as the same file by default, and the Linux build does not. Check that cause first, before you reinstall anything.

## Where does Spooky fit?

Spooky Particles watches your Vercel projects, and when a production deploy fails it alerts you on ntfy or email and passes the error line from the build log to your coding agent, Claude Code or Codex. The agent proposes the fix, for example a pull request. Spooky never changes your code itself.

To turn it on, give your agent [setup.md](/setup.md). The [quickstart](/docs/quickstart) has the same steps, [automate fixes](/automate-fixes) shows how a failed deploy becomes a pull request, and [VibeOps](/vibeops) is the wider practice of keeping shipped apps running.

## Price

Free, requires your own coding agent.
