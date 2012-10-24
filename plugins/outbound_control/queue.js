/**
 *   this queue maitains a dictionary, whose key is isp domain name, 
 *    e.g.  gmail.com, yahoo.com and aol.com etc; and the value is a
 *    list containing HMail objects to be sent to that domain.
 */
function Queue() 
{
    this.mails = {};
    this.length = 0;
}

/**
 * deuque an hmail from a list in the queue; the list to dequeue 
 * from depends on the index fed to this method. The method is 
 * called when processing the queue. When there are 1000 emails to be
 * delivered to 10 ISPs, we might not want to deliver 500 emails for 
 * gmail first, then to process remaining emails; instead, it might
 * be better to process an email for a different ISP each time.
 */
Queue.prototype.shift = function(index, keys) {
    var domain = keys[index];
    this.mails[domain] =  this.mails[domain] || [];
    while (this.mails[domain].length === 0) {
	index = ++index % keys.length;
	domain = keys[index];
    }
    this.length--;
    var mail  = this.mails[domain].shift();
    if (this.mails[domain].length === 0) {	
	delete this.mails[domain];
    }
    return mail;
}

/**
 * return an email for the provided domain name
 */
Queue.prototype.dequeue = function(domain) {
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

/**
 * push back an hmail object back to the queue
 * 
 */
Queue.prototype.push = function(hmail) {
    var domain = hmail._domain;
    this.mails[domain] = this.mails[domain] || [] ;
    this.mails[domain].push(hmail);
    this.length++;
}

/**
 *  obtain the number of hmail objects in the queue
 */
Queue.prototype.size = function() {
    return this.length;
}

exports.Queue = Queue;
