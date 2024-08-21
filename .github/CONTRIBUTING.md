We love and appreciate contributions to Haraka.

### To contribute code, use the Github "Pull Request" mechanism

#### Overview

1. fork, by clicking the Fork button on the project page
2. checkout a copy
3. create a branch
4. make changes
5. push changes to your fork
6. submit a Pull Request

#### Detailed Example

```sh
export GHUSERNAME=CHANGE_THIS
git clone https://github.com/$GHUSERNAME/Haraka.git
cd Haraka
git checkout -b new_branch
$EDITOR server.js
git add server.js
git commit
git push origin new_branch
```

The `git commit` step(s) will launch you into `$EDITOR` where the first line should be a summary of the change(s) in less than 50 characters. Additional paragraphs can be added starting on line 3.

To submit new_branch as a Pull Request, visit the [Haraka project page](https://github.com/haraka/Haraka) where your recently pushed branches will appear with a green "Pull Request" button.

### General Guidelines

- New features **must** be documented
- New features **should** include tests

### Style conventions

- 4 spaces for indentation (no tabs)
- Semi-colons on the end of statements are preferred
- Use whitespace between operators - we prefer `if (foo > bar)` over `if(foo>bar)`
- Don't comment out lines of code, remove them as they will be in the revision history.
- Use boolean true/false instead of numeric 0/1
- See [Editor Settings](Editor-Settings)

## Tests

- run all tests: ./run_tests (or "npm test")
- run tests for a single plugin: ./run_tests test/plugins/bounce.js
