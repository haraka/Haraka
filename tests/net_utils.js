"use strict";

var utils = require('/usr/home/matt/Haraka.matt/net_utils');

// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

// null input.
utils.checkPublicSuffix(null, null);
// Mixed case.
utils.checkPublicSuffix('COM', null);
utils.checkPublicSuffix('example.COM', 'example.com');
utils.checkPublicSuffix('WwW.example.COM', 'example.com');
// Leading dot.
utils.checkPublicSuffix('.com', null);
utils.checkPublicSuffix('.example', null);
utils.checkPublicSuffix('.example.com', null);
utils.checkPublicSuffix('.example.example', null);
// Unlisted TLD.
// utils.checkPublicSuffix('example', null);
// utils.checkPublicSuffix('example.example', 'example.example');
// utils.checkPublicSuffix('b.example.example', 'example.example');
// utils.checkPublicSuffix('a.b.example.example', 'example.example');
// Listed, but non-Internet, TLD.
//utils.checkPublicSuffix('local', null);
//utils.checkPublicSuffix('example.local', null);
//utils.checkPublicSuffix('b.example.local', null);
//utils.checkPublicSuffix('a.b.example.local', null);
// TLD with only 1 rule.
utils.checkPublicSuffix('biz', null);
utils.checkPublicSuffix('domain.biz', 'domain.biz');
utils.checkPublicSuffix('b.domain.biz', 'domain.biz');
utils.checkPublicSuffix('a.b.domain.biz', 'domain.biz');
// TLD with some 2-level rules.
utils.checkPublicSuffix('com', null);
utils.checkPublicSuffix('example.com', 'example.com');
utils.checkPublicSuffix('b.example.com', 'example.com');
utils.checkPublicSuffix('a.b.example.com', 'example.com');
utils.checkPublicSuffix('uk.com', null);
utils.checkPublicSuffix('example.uk.com', 'example.uk.com');
utils.checkPublicSuffix('b.example.uk.com', 'example.uk.com');
utils.checkPublicSuffix('a.b.example.uk.com', 'example.uk.com');
utils.checkPublicSuffix('test.ac', 'test.ac');
// TLD with only 1 (wildcard) rule.
utils.checkPublicSuffix('cy', null);
utils.checkPublicSuffix('c.cy', null);
utils.checkPublicSuffix('b.c.cy', 'b.c.cy');
utils.checkPublicSuffix('a.b.c.cy', 'b.c.cy');
// More complex TLD.
utils.checkPublicSuffix('jp', null);
utils.checkPublicSuffix('test.jp', 'test.jp');
utils.checkPublicSuffix('www.test.jp', 'test.jp');
utils.checkPublicSuffix('ac.jp', null);
utils.checkPublicSuffix('test.ac.jp', 'test.ac.jp');
utils.checkPublicSuffix('www.test.ac.jp', 'test.ac.jp');
utils.checkPublicSuffix('kyoto.jp', null);
utils.checkPublicSuffix('test.kyoto.jp', 'test.kyoto.jp');
utils.checkPublicSuffix('ide.kyoto.jp', null);
utils.checkPublicSuffix('b.ide.kyoto.jp', 'b.ide.kyoto.jp');
utils.checkPublicSuffix('a.b.ide.kyoto.jp', 'b.ide.kyoto.jp');
utils.checkPublicSuffix('c.kobe.jp', null);
utils.checkPublicSuffix('b.c.kobe.jp', 'b.c.kobe.jp');
utils.checkPublicSuffix('a.b.c.kobe.jp', 'b.c.kobe.jp');
utils.checkPublicSuffix('city.kobe.jp', 'city.kobe.jp');
utils.checkPublicSuffix('www.city.kobe.jp', 'city.kobe.jp');
// TLD with a wildcard rule and exceptions.
utils.checkPublicSuffix('ck', null);
utils.checkPublicSuffix('test.ck', null);
utils.checkPublicSuffix('b.test.ck', 'b.test.ck');
utils.checkPublicSuffix('a.b.test.ck', 'b.test.ck');
utils.checkPublicSuffix('www.ck', 'www.ck');
utils.checkPublicSuffix('www.www.ck', 'www.ck');
// US K12.
utils.checkPublicSuffix('us', null);
utils.checkPublicSuffix('test.us', 'test.us');
utils.checkPublicSuffix('www.test.us', 'test.us');
utils.checkPublicSuffix('ak.us', null);
utils.checkPublicSuffix('test.ak.us', 'test.ak.us');
utils.checkPublicSuffix('www.test.ak.us', 'test.ak.us');
utils.checkPublicSuffix('k12.ak.us', null);
utils.checkPublicSuffix('test.k12.ak.us', 'test.k12.ak.us');
utils.checkPublicSuffix('www.test.k12.ak.us', 'test.k12.ak.us');
// IDN labels.
utils.checkPublicSuffix('食狮.com.cn', '食狮.com.cn');
utils.checkPublicSuffix('食狮.公司.cn', '食狮.公司.cn');
utils.checkPublicSuffix('www.食狮.公司.cn', '食狮.公司.cn');
utils.checkPublicSuffix('shishi.公司.cn', 'shishi.公司.cn');
utils.checkPublicSuffix('公司.cn', null);
utils.checkPublicSuffix('食狮.中国', '食狮.中国');
utils.checkPublicSuffix('www.食狮.中国', '食狮.中国');
utils.checkPublicSuffix('shishi.中国', 'shishi.中国');
utils.checkPublicSuffix('中国', null);
// Same as above, but punycoded.
utils.checkPublicSuffix('xn--85x722f.com.cn', 'xn--85x722f.com.cn');
utils.checkPublicSuffix('xn--85x722f.xn--55qx5d.cn', 'xn--85x722f.xn--55qx5d.cn');
utils.checkPublicSuffix('www.xn--85x722f.xn--55qx5d.cn', 'xn--85x722f.xn--55qx5d.cn');
utils.checkPublicSuffix('shishi.xn--55qx5d.cn', 'shishi.xn--55qx5d.cn');
utils.checkPublicSuffix('xn--55qx5d.cn', null);
// utils.checkPublicSuffix('xn--85x722f.xn--fiqs8s', 'xn--85x722f.xn--fiqs8s');
// utils.checkPublicSuffix('www.xn--85x722f.xn--fiqs8s', 'xn--85x722f.xn--fiqs8s');
// utils.checkPublicSuffix('shishi.xn--fiqs8s', 'shishi.xn--fiqs8s');
utils.checkPublicSuffix('xn--fiqs8s', null);
