#!/bin/sh

usage()
{
    echo "$0 \$plugin_name"
    exit
}

if [ -z "$1" ]; then
    usage
fi

export GITHUB_ORG="haraka"
export PLUGIN_NAME="haraka-plugin-$1"
export PLUGIN_REPO="../$PLUGIN_NAME"
export GIT_CMD="git -C $PLUGIN_REPO"

if [ -d "$PLUGIN_REPO" ]; then
    echo "repo exists at $PLUGIN_REPO"
else
    git clone git@github.com:haraka/haraka-plugin-template.git "$PLUGIN_REPO" || exit
    $GIT_CMD remote rm origin || exit
    $GIT_CMD remote add origin "git@github.com:$GITHUB_ORG/$PLUGIN_NAME.git" || exit
fi

if grep template "$PLUGIN_REPO/README.md"; then
    echo "redressing as $PLUGIN_NAME"
    sed -i '' -e "s/template/${1}/g" "$PLUGIN_REPO/README.md"

    sed -i '' \
        -e "s/template/${1}/g" \
        -e "s/template\.ini/$1.ini/" \
        "$PLUGIN_REPO/test/index.js"

    sed -i '' -e "s/template/${1}/g" "$PLUGIN_REPO/package.json"

    sed -i '' \
        -e "s/_template/_${1}/g" \
        -e "s/template\.ini/$1.ini/" \
        "$PLUGIN_REPO/index.js"

    $GIT_CMD mv config/template.ini "config/$1.ini"

    $GIT_CMD add package.json README.md index.js test config
    $GIT_CMD commit -m "publish $1 as NPM module"

    $GIT_CMD rm redress.sh
fi

if [ -f "docs/plugins/$1.md" ]; then
    echo "copying docs/plugin/$1.md to $PLUGIN_REPO/README.md"
    head -n8 "$PLUGIN_REPO/README.md" > foo.md
    cat "docs/plugins/$1.md" >> foo.md
    tail -n14 "$PLUGIN_REPO/README.md" >> foo.md
    mv foo.md "$PLUGIN_REPO/README.md"
    git rm "docs/plugins/$1.md" || exit
fi

if [ -f "config/$1.ini" ]; then
    echo "copying $1.ini"
    cp "config/$1.ini" "$PLUGIN_REPO/config/$1.ini"
    git rm "config/$1.ini"
    $GIT_CMD add "config/$1.ini"
fi

if [ -f "plugins/$1.js" ]; then
    echo "copying plugins/$1.js"
    cp "plugins/$1.js" "$PLUGIN_REPO/index.js"
    tee "plugins/$1.js" <<DEPRECATED
exports.register = function () {
    this.logerror('This plugin has moved. See https://github.com/haraka/haraka-plugin-$1');
}
DEPRECATED
    $GIT_CMD add index.js
fi

if [ -f "test/plugins/$1.js" ]; then
    echo "copying test/plugins/$1.js"
    cp "test/plugins/$1.js" "$PLUGIN_REPO/test/index.js"
    git rm "test/plugins/$1.js"
fi
