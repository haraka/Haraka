# log.elasticsearch

# Logging

Unless errors are encountered, no logs are emitted.

# Errors

The elasticsearch module has very robust error handling built in. If there's a
connection issue, errors such as these will be emitted when Haraka starts
up:

* Elasticsearch cluster is down!
* No Living connections

However, ES will continue attempting to connect and when the ES server becomes
available, logging will begin. If errors are encountered trying to save data
to ES, they look like this:

* No Living connections
* Request Timeout after 30000ms

They normally fix themselves when ES resumes working properly.

# Configuration

* host - an IP or hostname of the ES server to connect to

    host=127.0.0.2

* pluginObject

By default, all plugin results are presented as `$plugin_name: { ... }`, at
the top level. If you prefer that all plugin results be nested inside an
object `$obj: { $plugin_name: { ...}`, set pluginObject to that object's key name

    pluginObject=plugin


* [ignore_hosts]

A config file section for hosts whose results should not be stored in
ES. HAproxy servers, Nagios, and other hosts who monitor Haraka can be listed
here. The format for entries is host.name=true

* [index]

    transaction=smtp-transaction
    connection=smtp-connection

Transactions include all the connection information and are "the good stuff."
When a connection has transactions, the connection is not saved separately.
The distinction is that a connection is stored only when it has zero
transactions. The connections index tends to be mostly noise (monitoring,
blocked connections, bruteforce auth attempts, etc.). To collapse them into
the same index, set the value for both identically.


# Index map template

Creating a map template will apply the template(s) to any future indexes that
match the pattern/name in the template setting. This is how to manually apply
an index map template:

```json
curl -XPUT localhost:9200/_template/haraka_results -d '
{
    "template" : "smtp-*",
    "mappings" : {
        "haraka" : {
            "dynamic_templates" : [
                { "fail_results" : {
                        "match" : "fail",
                        "mapping" : {
                            "type" : "string", "index" : "not_analyzed"
                        }
                    }
                },
                { "pass_results" : {
                        "match" : "pass",
                        "mapping" : {
                            "type" : "string", "index" : "not_analyzed"
                        }
                    }
                },
                { "skip_results" : {
                        "match" : "skip",
                        "mapping" : {
                            "type" : "string", "index" : "not_analyzed"
                        }
                    }
                },
                { "msg_results" : {
                        "match" : "msg",
                        "mapping" : {
                            "type" : "string", "index" : "not_analyzed"
                        }
                    }
                },
                { "err_results" : {
                        "match" : "err",
                        "mapping" : {
                            "type" : "string", "index" : "not_analyzed"
                        }
                    }
                },
                { "ip_addrs" : {
                        "match" : "ip",
                        "mapping" : { "type" : "ip" }
                    }
                },
                { "hostnames" : {
                        "match" : "host",
                        "mapping" : {
                            "type" : "string", "index" : "not_analyzed"
                        }
                    }
                }
            ],
            "properties" : {
                "plugin" : {
                    "properties" : {
                        "asn" : {
                            "properties" : {
                                "org" : { "type" : "string", "index" : "not_analyzed" },
                                "asn_good"        : { "type" : "double" },
                                "asn_bad"         : { "type" : "double" },
                                "asn_score"       : { "type" : "double" },
                                "asn_connections" : { "type" : "double" }
                            }
                        },
                        "geoip" : {
                            "properties" : {
                                "org"      : { "type" : "string", "index" : "not_analyzed" },
                                "geo"      : { "type" : "geo_point" },
                                "distance" : { "type" : "float" }
                            }
                        },
                        "helo" : {
                            "properties"   : {
                                "ips"      : { "type" : "string", "index" : "not_analyzed" }
                            }
                        },
                        "fcrdns" : {
                            "properties"    : {
                                "fcrdns"    : { "type" : "string", "index" : "not_analyzed" },
                                "other_ips" : { "type" : "string", "index" : "not_analyzed" },
                                "ptr_names" : { "type" : "string", "index" : "not_analyzed" }
                            }
                        },
                        "p0f" : {
                            "properties" : {
                                "os_flavor" : { "type" : "string", "index" : "not_analyzed" }
                            }
                        },
                        "rspamd" : {
                            "properties"   : {
                                "emails"   : { "type" : "string", "index" : "not_analyzed" },
                                "urls"     : { "type" : "string", "index" : "not_analyzed" },
                                "messages" : { "type" : "string", "index" : "not_analyzed" }
                            }
                        },
                        "karma" : {
                            "properties" : {
                                "connect"   : { "type" : "double" },
                                "score"     : { "type" : "double" },
                                "good"      : { "type" : "double" },
                                "bad"       : { "type" : "double" },
                                "history"   : { "type" : "double" },
                                "connections" : { "type" : "double" },
                                "total_connects" : { "type" : "double" },
                                "neighbors" : { "type" : "double" }
                            }
                        },
                        "spamassassin" : {
                            "properties" : {
                                "headers": {
                                    "properties" : {
                                        "report" : { "type" : "string", "index" : "not_analyzed" },
                                        "Status" : { "type" : "string", "index" : "not_analyzed" }
                                    }
                                },
                                "line0" : { "type" : "string", "index" : "not_analyzed" },
                                "reqd"  : { "type" : "double" },
                                "score" : { "type" : "double" },
                                "tests" : { "type" : "string", "index" : "not_analyzed" }
                            }
                        },
                        "spf" : {
                            "properties" : {
                                "domain" : { "type" : "string", "index" : "not_analyzed" }
                            }
                        }
                    }
                },
                "message" : {
                    "properties" : {
                        "bytes" : { "type": "double" },
                        "envelope": {
                            "properties": {
                                "sender" : { "type" : "string", "index" : "not_analyzed" },
                                "recipient" : {
                                    "properties"  : {
                                        "action"  : { "type" : "string", "index" : "not_analyzed" },
                                        "address" : { "type" : "string", "index" : "not_analyzed" }
                                    }
                                }
                            }
                        },
                        "header": {
                            "properties": {
                                "from"         : { "type" : "string", "index" : "not_analyzed" },
                                "to"           : { "type" : "string", "index" : "not_analyzed" },
                                "subject"      : { "type" : "string", "index" : "not_analyzed" },
                                "message-id"   : { "type" : "string", "index" : "not_analyzed" },
                                "date"         : { "type" : "string", "index" : "not_analyzed" },
                                "reply-to"     : { "type" : "string", "index" : "not_analyzed" },
                                "resent-from"  : { "type" : "string", "index" : "not_analyzed" },
                                "resent-header": { "type" : "string", "index" : "not_analyzed" },
                                "sender"       : { "type" : "string", "index" : "not_analyzed" }
                            }
                        },
                        "body" : {
                            "properties" : {
                                "attachment" : {
                                    "properties": {
                                        "bytes" : { "type" : "float" },
                                        "ctype" : { "type" : "string" },
                                        "file"  : { "type" : "string" },
                                        "md5"   : { "type" : "string", "index": "not_analyzed" }
                                    }
                                }
                            }
                        },
                        "queue" : {
                            "properties" : {

                            }
                        }
                    }
                },
                "connection" : {
                    "properties" : {
                        "count" : {
                            "properties" : {
                                "msg" : {
                                    "properties" : {
                                        "accept" : { "type": "integer" },
                                        "reject" : { "type": "integer" },
                                        "tempfail" : { "type": "integer" }
                                    }
                                },
                                "rcpt" : {
                                    "properties" : {
                                        "accept" : { "type": "integer" },
                                        "reject" : { "type": "integer" },
                                        "tempfail" : { "type": "integer" }
                                    }
                                },
                                "errors" : { "type": "integer" },
                                "trans" : { "type": "integer" }
                            }
                        },
                        "early" : { "type" : "boolean" }
                    }
                }
            }
        }
    }
}'

```
