FROM shipimg/microbase:{{%TAG%}}

RUN echo 'ALL ALL=(ALL) NOPASSWD:ALL' | tee -a /etc/sudoers

ADD . /home/shippable/runSh
RUN mkdir -p /home/shippable/runSh/logs
RUN cd /home/shippable/runSh && npm install
RUN mkdir -p /shippableci
VOLUME /shippableci

ENTRYPOINT ["/home/shippable/runSh/boot.sh"]
