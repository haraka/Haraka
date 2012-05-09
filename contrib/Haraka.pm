package Mail::SpamAssassin::Plugin::Haraka;
my $VERSION = 0.1;

use warnings;
use strict;
use Mail::SpamAssassin::Plugin;
use vars qw(@ISA);
@ISA = qw(Mail::SpamAssassin::Plugin);

sub dbg {
    Mail::SpamAssassin::Plugin::dbg ("Haraka: @_");
}

sub new {
    my ($class, $mailsa) = @_;
    $class = ref($class) || $class;
    my $self = $class->SUPER::new($mailsa);
    bless ($self, $class);
    $self->register_eval_rule("get_haraka_uuid");
}

sub get_haraka_uuid {
    my ($self, $pms) = @_;

    # Add last external IP
    my $le = $pms->get_tag('LASTEXTERNALIP');
    if(defined($le) && $le) {
        $pms->set_spamd_result_item( sub { return "last-external=$le"; } );
    }
    my $header = $pms->get("X-Haraka-UUID");
    if(defined($header) && $header) {
        $pms->set_spamd_result_item( sub { return "haraka-uuid=$header"; } );
    }
    return 0;
}
