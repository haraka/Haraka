### General Guidelines

* New features **must** be documented
* Changes **must** pass integration tests.
* Changes **should** increase overall test coverage.

## Rebasing

### When to Rebase

On branches with more than a couple commits, it's usually best to squash the commits (condense them into one). Exceptions to the single commit guideline are:

* multiple logical changes, put each in a commit (easier to review and revert)
* whitespace changes belong in their own commit
* no-op code refactoring is separate from functional changes

### How to Rebase

```sh
git remote add haraka https://github.com/haraka/Haraka.git
git remote update haraka
git rebase -i haraka/master
```

Change all but the first "pick" lines to "s" and save your changes. Your $EDITOR will then present you with all of the commit messages. Edit them and save. Then force push your branch:

`git push -f`


### Style conventions

* 4 space indentions (no tabs)
* Semi-colons on the end of statements are preferred
* Use underscores\_to\_separate\_names (yes this goes against JS conventions - it's the way it has always been done)
* Do not [cuddle elses](http://c2.com/cgi/wiki?CuddledElseBlocks)
* Use whitespace between operators - we prefer `if (foo > bar)` over `if(foo>bar)`
* Don't comment out lines of code, remove them. They will be in the revision history.
* Use boolean true/false instead of numeric 0/1
* See [Editor Settings](https://github.com/haraka/Haraka/wiki/Editor-Settings)

## Tests

* run all tests: "npm test"
* run tests for a single plugin: ./run_tests tests/plugins/bounce.js
