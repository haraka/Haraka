# delay\_deny

Delays all pre-DATA 'deny' results until the recipients are sent
and all post-DATA commands until all hook\_data\_post plugins have run.
This allows relays and authenticated users to bypass pre-DATA rejections.

## Configuration

Configuration options are in config/delay\_deny.ini.

This plugin operates in one of two modes: included and excluded.

### included plugins

A comma or semicolon separated list of denials that are to be included.
In this mode, _only_ plugins in the list are bypassed. All other plugins
can immediately reject connections.

### excluded plugins

A comma or semicolon separated list of denials that are to be excluded.
Excluded plugins that are not bypassed and can still immediately reject
connections.

