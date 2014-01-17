# delay_deny

Delays all pre-DATA 'deny' results until the recipients are sent
and all post-DATA commands until all hook_data_post plugins have run.
This allows relays and authenticated users to bypass pre-DATA rejections.

## Configuration

Configuration options are in config/delay_deny.ini.

### excluded plugins

a list of denials that are to be excluded (ie, all the immediate rejection)

