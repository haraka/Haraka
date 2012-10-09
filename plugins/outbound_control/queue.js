function Queue() 
{
    this.mails = {};
    this.length = 0;
}

Queue.prototype.shift = function(index, keys) {
    var domain = keys[index];
    this.mails[domain] =  this.mails[domain] || [];
    
    while (this.mails[domain].length === 0) {
	index = ++index % keys.length;
	domain = keys[index];
    }
    
    this.length--;
    var file  = this.mails[domain].shift();
    if (this.mails[domain].length === 0) {	
	delete this.mails[domain];
    }
    return file;
}

Queue.prototype.dequeue = function(hmail) {
    var domain = hmail._domain;
    var list = this.mails[domain] || [];
    if (list.length === 0)
        return null;
    else
    {
        var mail = list.shift();
        this.length--;
        if(list.length === 0)
            delete this.mails[domain];
        return mail;
    }
}

Queue.prototype.push = function(hmail) {
    var domain = hmail.dom;
    this.mails[domain] = this.mails[domain] || [] ;
    this.mails[domain].push(hmail);
    this.length++;
}

Queue.prototype.size = function() {
    return this.length;
}

exports.Queue = Queue;
