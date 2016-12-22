FROM shipimg/microbase:master.727

RUN echo 'ALL ALL=(ALL) NOPASSWD:ALL' | tee -a /etc/sudoers

# Upgrade PIP
RUN apt-get remove -y python-pip
RUN easy_install pip

ADD . /home/shippable/runSh

RUN cd /home/shippable/runSh && npm install
RUN cd /home/shippable/runSh && pip install -r requirements.txt

ENTRYPOINT ["/home/shippable/runSh/boot.sh"]
