# data.headers

This plugin performs a variety of mail header inspection checks.


### RFC 5322 Section 3.6:

> All messages MUST have a 'Date' and 'From' header and a message may not contain
> more than one 'Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc', 'Bcc',
> 'Message-Id', 'In-Reply-To', 'References' or 'Subject' header.

The list of required and singular headers can be customized in
config/data.headers.ini.

The next two tests encompass the RFC 5322 checks:

## duplicate\_singular

Assure that all the singular headers are present only once. The list of
headers can be adjusted in config/data.headers.ini:

    singular=Date,From,Sender,Reply-To,To,Cc,Bcc,Message-Id,In-Reply-To,References,Subject

## missing\_required

Assuring that all the required headers are present. The list of required
headers can be altered in config/data.headers.ini:

    required=From,Date

## invalid\_return\_path

Messages arriving via the internet should not have a Return-Path header set.
This checks for that header (unless connection.relaying is set).

## invalid\_date

Checks the date header and makes sure it's somewhat sane. By default, the date
cannot be more than 2 days in the future nor 15 days in the past. These can be
adjusted in config/data.headers.ini:

    date_future_days=2
    date_past_days=15

## user\_agent

Attempt to determine the User-Agent that generated the email. A UA is
determinable on about 70% of hammy messages.

## direct\_to\_mx

Counts the received headers. If there aren't at least two, then the MUA is
attempting direct delivery to us instead of via their outbound SMTP server.
This is typical of spam, our own users sending outbound email (which bypasses
this test), and machine generated messages like Facebook/Twitter
notifications.

## from\_match

See if the header From domain matches the envelope FROM domain. There are many
legit reasons to not match, but matching domains are far more frequent in ham.

## mailing\_list

Attempt to determine if this message was sent via an email list. This is very
rudimentary at present and only detects the most common email lists..


# Configuration

The data.headers.ini file can contain [check] and [reject] sections that
enable/disable each check, as well as enable/disable rejections for each
check. To turn on User Agent detection and turn off Mailing List detection:

    [check]
    user_agent=true
    mailing_list=false

To prevent a missing header from causing the messages to be rejected:

    [reject]
    missing_required=false
