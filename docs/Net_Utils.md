Net\_Utils
=========

This module provides network utility functions.

## Usage

    var net_utils = require('./net_utils');

### ip_to_long

    // Convert IPv4 to long
    var long = net_utils.ip_to_long('11.22.33.44');  // 185999660

### long_to_ip

    // Convert long to IPv4
    var ip = net_utils.long_to_ip(185999660);  // 11.22.33.44

### dec_to_hex

    // Convert decimal to hex
    var hex = net_utils.dec_to_hex(20111104);  // 132df00

### hex_to_dec

    // Convert hex to decimal
    var dec = net_utils.hex_to_dec('132df00');  // 20111104

### is_local_ipv4

    // Is IPv4 address on a local network?
    net_utils.is_local_ipv4('127.0.0.200');   // true (localhost)
    net_utils.is_local_ipv4('169.254.0.0');   // true (link local)
    net_utils.is_local_ipv4('226.0.0.1');     // false

### is_private_ipv4

    // Is IPv4 address in RFC 1918 reserved private address space?
    net_utils.is_private_ipv4('10.0.0.0');       // true
    net_utils.is_private_ipv4('192.168.0.0');    // true
    net_utils.is_private_ipv4('172.16.0.0');     // true

### is_local_ipv6

    // Is IPv6 addr on local network?
    net_utils.is_local_ipv6('::1');           // true (localhost)
    net_utils.is_local_ipv6('fe80::')         // true (link local)
    net_utils.is_local_ipv6('fc00::')         // true (unique local)
    net_utils.is_local_ipv6('fd00::')         // true (unique local)

### is_private_ip

    // determines if an IPv4 or IPv6 address is on a "private" network
    // For IPv4, returns true if is_private_ipv4 or is_local_ipv4 are true
    // For IPv6, returns true if is_local_ipv6 is true
