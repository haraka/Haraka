backscatterer
=============

This is a very basic pluign that checks the connecting IP against
ips.backscatterer.org when the envelope-from is null or postmaster@
as per the instructions at http://www.backscatterer.org/?target=usage

This plugin is used to reject misdirected bounces and autoresponders
and sender callouts from abusive systems which can happen when a 
local domain is spoofed and used as the envelope-from in a spam run.
