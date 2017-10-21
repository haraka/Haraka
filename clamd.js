import fixtures from 'haraka-test-fixtures';

const Connection   = fixtures.connection;

const _set_up =  (done) => {

    this.plugin = new fixtures.plugin('clamd');
    this.plugin.register();

    this.connection = Connection.createConnection();

    this.connection.transaction = {
        notes: {},
        results: new fixtures.results(this.plugin),
    };

    done();
};

export var load_clamd_ini = {
    setUp : _set_up,
    'none'(test) {
        test.expect(1);
        test.deepEqual([], this.plugin.skip_list);
        test.done();
    },
    'defaults'(test) {
        test.expect(6);
        const cfg = this.plugin.cfg.main;
        test.equal('localhost:3310', cfg.clamd_socket);
        test.equal(30, cfg.timeout);
        test.equal(10, cfg.connect_timeout);
        test.equal(26214400, cfg.max_size);
        test.equal(false, cfg.only_with_attachments);
        test.equal(false, cfg.randomize_host_order);
        test.done();
    },
    'reject opts'(test) {
        test.expect(14);
        test.equal(true, this.plugin.rejectRE.test('Encrypted.'));
        test.equal(true, this.plugin.rejectRE.test('Heuristics.Structured.'));
        test.equal(true, this.plugin.rejectRE.test(
            'Heuristics.Structured.CreditCardNumber'));
        test.equal(true, this.plugin.rejectRE.test('Broken.Executable.'));
        test.equal(true, this.plugin.rejectRE.test('PUA.'));
        test.equal(true, this.plugin.rejectRE.test(
            'Heuristics.OLE2.ContainsMacros'));
        test.equal(true, this.plugin.rejectRE.test('Heuristics.Safebrowsing.'));
        test.equal(true, this.plugin.rejectRE.test(
            'Heuristics.Safebrowsing.Suspected-phishing_safebrowsing.clamav.net'));
        test.equal(true, this.plugin.rejectRE.test(
            'Sanesecurity.Junk.50402.UNOFFICIAL'));
        test.equal(false, this.plugin.rejectRE.test(
            'Sanesecurity.UNOFFICIAL.oops'));
        test.equal(false, this.plugin.rejectRE.test('Phishing'));
        test.equal(false, this.plugin.rejectRE.test(
            'Heuristics.Phishing.Email.SpoofedDomain'));
        test.equal(false, this.plugin.rejectRE.test('Suspect.Executable'));
        test.equal(false, this.plugin.rejectRE.test('MattWuzHere'));
        test.done();
    },
};

export var hook_data = {
    setUp : _set_up,
    'only_with_attachments, false'(test) {
        test.expect(2);
        test.equal(false, this.plugin.cfg.main.only_with_attachments);
        const next = () => {
            test.equal(undefined, this.connection.transaction.parse_body);
            test.done();
        };
        this.plugin.hook_data(next, this.connection);
    },
    'only_with_attachments, true'(test) {
        this.plugin.cfg.main.only_with_attachments=true;
        test.expect(2);
        this.connection.transaction.attachment_hooks = () => {};
        const next = () => {
            test.equal(true, this.plugin.cfg.main.only_with_attachments);
            test.equal(true, this.connection.transaction.parse_body);
            test.done();
        };
        this.plugin.hook_data(next, this.connection);
    },
};

export var hook_data_post = {
    setUp : _set_up,
    'skip attachment'(test) {
        this.connection.transaction.notes = { clamd_found_attachment: false };
        this.plugin.cfg.main.only_with_attachments=true;
        test.expect(1);
        const next = () => {
            test.ok(this.connection.transaction.results.get('clamd').skip);
            test.done();
        };
        this.plugin.hook_data_post(next, this.connection);
    },
    'message too big'(test) {
        this.connection.transaction.data_bytes=513;
        this.plugin.cfg.main.max_size=512;
        test.expect(1);
        const next = () => {
            test.ok(this.connection.transaction.results.get('clamd').skip);
            test.done();
        };
        this.plugin.hook_data_post(next, this.connection);
    },
};
