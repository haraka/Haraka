virtual_mta
========

This plugin is made to work with 'Outbound HARAKA server'. The use of 'virtual_mta'
plugin will gives you the ability and the full control to add and administer
as many virtual MTAs and IP addresses as you need, allowing you to create enormous
potential sending capacity.

You could send every email with specific/customized VMTA ('IP/HOST') just by
assigning your emails to the appropriate VMTA by adding the `x-vmta` header to your
emails (The value of `x-vmta` parameter should be pre-defined in the config file),
e.g :


Subject: xxxx
From: xxxx
...
x-vmta: mta_name_1       <<----------- Just add the param to your header
...


The 'mta_name_1' in the previous example is one of the VMTAs you should pre-define in
your configuration file `vmta.ini` with simple format as shown in the 'Configuration'
section bellow.

Configuration
-------------

- First of all you should create the config file `config/vmta.ini`

- In the config file you could simply add the virtual MTA information as the sample
bellow shown, every VMTA has name and 'IP/HOST' :

[mta_name_1]
ip = IP_1
host = HOST_1

[mta_name_2]
ip = IP_2
host = HOST_2


Usage
-----
To enable the **virtual_mta** plugin, add an entry (virtual_mta) to the `config/plugins`.


Test
----
After enabling the plugin you could test it simply using the smtp transaction tester light-tool
'swaks' using the following command line :

swaks -f youremail@yourdomain.com -t test@example.com -add-header "x-vmta: your_vmta_name"  \
  -s localhost -p 587 -au testuser -ap testpassword


NOTE
----
The passed parameter 'x-vmta' will be automatically removed from the header so the
delivered email's header will not contain the parameter.



