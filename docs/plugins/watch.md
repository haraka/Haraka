# watch - smtp connections in HTTP browser

Watch SMTP traffic to your Haraka server in a web interface. 

![Watch Screen Capture](http://www.tnpi.net/internet/mail/haraka-watch.png)


## Enable Watch

1. Enable Haraka's HTTP server (see `listen` in http.ini)
2. Add 'watch' to config/plugins
3. Point your web browser at http://mail.example.com/watch/

Enjoy the blinky lights. 


## Tips

* Hover your mouse pointer or tap (with touch devices) on table data to see more
details. 
* Copy that connection UUID at left and use it to grep your logs for even more.
* Edit the files in watch/html and play with the appearance. If you make it
  better, post a screen shot somewhere and create an Issue or PR.


## Interpretation Key

* Green: tests passed
* Light Green: tests passed, but with conditions
* Yellow: poor results, but not awful.
* Light red: tests failed, but no rejection
* Red: tests failed causing rejection

