#!/usr/bin/perl

use warnings;
use strict;

use IO::Socket;

my $server = IO::Socket::INET->new(Listen => 5, LocalPort => 2525, Proto => "tcp");
$server || die $!;

while (my $client = $server->accept()) {
    print "Got connection\n";
    $client->print("220 hostname\r\n");
    my $helo = <$client>;
    $client->print("250 hi\r\n");
    my $mail = <$client>;
    $client->print("250 ok\r\n");
    my $rcpt = <$client>;
    $client->print("250 ok\r\n");
    my $data = <$client>;
    $client->print("354 ok\r\n");
    my $line = <$client>;
    $client->close();
    print "Closed client\n";
}
