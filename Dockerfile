# This file describes how to build Haraka into a runnable linux container with all dependencies installed
# To build:
# 1.) Install docker (http://docker.io)
# 2.) Clone Haraka repo if you haven't already: git clone https://github.com/baudehlo/Haraka.git
# 3.) Modify config/host_list with the domain(s) that you'd like to receive mail to
# 4.) Build: cd Haraka && docker build .
# 5.) Run:
# docker run -d <imageid>
#
# VERSION           0.1
# DOCKER-VERSION    0.5.3

# See http://phusion.github.io/baseimage-docker/
FROM phusion/baseimage:0.9.13 

MAINTAINER Justin Plock <jplock@gmail.com>

ENV HOME /root

RUN /etc/my_init.d/00_regen_ssh_host_keys.sh

RUN sed 's/main$/main universe/' -i /etc/apt/sources.list
RUN DEBIAN_FRONTEND=noninteractive apt-get -y -q update
RUN DEBIAN_FRONTEND=noninteractive apt-get -y -q install python-software-properties g++ make git curl
RUN curl -sL https://deb.nodesource.com/setup | sudo bash -
RUN DEBIAN_FRONTEND=noninteractive apt-get -y -q install nodejs
RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Optional, useful for development
# See https://github.com/phusion/baseimage-docker#login_ssh
#RUN /usr/sbin/enable_insecure_key

# Install Haraka
RUN npm install -g Haraka
RUN haraka -i /usr/local/haraka
ADD ./config/host_list /usr/local/haraka/config/host_list
ADD ./config/plugins /usr/local/haraka/config/plugins
RUN cd /usr/local/haraka && npm install

# Create haraka runit service
RUN mkdir /etc/service/haraka
ADD haraka.sh /etc/service/haraka/run

EXPOSE 25

# Start the init daemon - runit will launch the Haraka process
CMD ["/sbin/my_init"]
