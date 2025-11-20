# queue/test

This plugin saves incoming E-Mail to your temporary directory, as `mail_{message_id}.eml`, where message_id is a UUID.

This plugin can be useful to quickly test if you're able to receive incoming E-Mail and just dump them to disk.

The temporary directory is determined using Node's [`os.tmpdir()`](https://nodejs.org/api/os.html#ostmpdir), which respects standard platform configurations.
