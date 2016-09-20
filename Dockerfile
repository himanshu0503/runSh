FROM shipimg/microbase:master.727

ADD . /home/shippable/runSh

RUN cd /home/shippable/runSh && npm install

ENTRYPOINT ["/home/shippable/runSh/boot.sh"]
