### Dev instructions ###

1. npm install
2. Setup mongo at localhost:27017
3. In mongoShell, create new db and user. (update file config/keys.js)
3. npm run server
4. ngrok http 8080
5. Place ngrok url on dialogflow webhook url

***

### Deploy instructions ###

1. clone repo to /var/www/ and `npm install` inside

2. Install mongodb
    `sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv EA312927`
    `echo "deb http://repo.mongodb.org/apt/ubuntu xenial/mongodb-org/3.2 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-3.2.list`
    `sudo apt-get update`
    `sudo apt-get install -y mongodb-org`

3. Launch mongodb as a service
In `sudo nano /etc/systemd/system/mongodb.service`, paste the follow

        [Unit]
        Description=High-performance, schema-free document-oriented database
        After=network.target

        [Service]
        User=mongodb
        ExecStart=/usr/bin/mongod --quiet --config /etc/mongod.conf

        [Install]
        WantedBy=multi-user.target

4. Start mongo service
`sudo systemctl start mongodb`
(check if it's active by running `sudo systemctl status mongodb`

5. Open mongoshell and create db
`mongo`
`use kookapp`

6. Create db user
`db.createUser({user:"kookapp", pwd:”kookapp", roles:[{role:"readWrite", db:"kookapp"}]})`

5. Let mongo service start on startup
`sudo systemctl enable mongodb`


7. Install node
`sudo apt-get install python-software-properties`
`curl -sL https://deb.nodesource.com/setup_11.x | sudo -E bash`
`sudo apt-get install nodejs`

8. Install PM2
`sudo npm install pm2@latest -g`

9. create webhook.config.js at /var/www/ with:

          module.exports = {
            apps : [{
              name        : "KookAppWebHook",
              script      : "index.js",
              watch       : true,
              merge_logs  : true,
              cwd         : "/var/www/KookAppWebHook",
             }]
          }
  
10. start app with PM2
`pm2 start webhook.config.js`
