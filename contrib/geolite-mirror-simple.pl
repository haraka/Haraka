#!/usr/bin/perl
use strict;
our $VERSION = '0.02';
use LWP::Simple qw/ mirror RC_NOT_MODIFIED RC_OK $ua /;
use File::Copy  qw/ mv /;
use File::Spec;
use PerlIO::gzip;

# --- maxmind.com - please send comments to support@maxmind.com
#
# mirror various maxmind databases from geolite.maxmind.com.
# The script download only changed files, unzip the files and
# move it into the desired directory.
#
# Here is a sample cron entry that check daily for new files.
# 34 15 * * * /usr/local/bin/geolite-mirror-simple.pl

# adjust the path to your needs. Make sure the directories exists
-d ( my $download_dir = '/usr/local/share/GeoIP/download' ) or die $!;
-d ( my $dest_dir     = '/usr/local/share/GeoIP' )          or die $!;

# --- remove lines you do not need
# geoip customers should rename or remove GeoIP.dat.gz and GeoIPCity.dat.gz
# This example overwrite your GeoIPCity.dat database!

my %mirror = (    # local-filename       geolite-name
               'GeoIP.dat.gz'        => 'GeoLiteCountry/GeoIP.dat.gz',
               'GeoIPCity.dat.gz'    => 'GeoLiteCity.dat.gz',
               'GeoIPCityv6.dat.gz'  => 'GeoLiteCityv6-beta/GeoLiteCityv6.dat.gz',
               'GeoIPv6.dat.gz'      => 'GeoIPv6.dat.gz',
               'GeoIPASNum.dat.gz'   => 'asnum/GeoIPASNum.dat.gz',
               'GeoIPASNumv6.dat.gz' => 'asnum/GeoIPASNumv6.dat.gz',
);

$ua->agent("MaxMind-geolite-mirror-simple/$VERSION");
my $dl_path = 'http://geolite.maxmind.com/download/geoip/database/';

chdir $download_dir or die $!;
for my $f ( keys %mirror ) {
  my $rc = mirror( $dl_path . $mirror{$f}, $f );
  next if $rc == RC_NOT_MODIFIED;
  if ( $rc == RC_OK ) {
    ( my $outfile = $f ) =~ s/\.gz$//;
    open my $in,  '<:gzip', $f       or die $!;
    open my $out, '>',      $outfile or die $!;
    print $out $_ or die $! while <$in>;
    mv( $outfile, File::Spec->catfile( $dest_dir, $outfile ) ) or die $!;
  }
}
exit 0;

