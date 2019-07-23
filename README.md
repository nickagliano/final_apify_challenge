# apify-challenge

## how to use

### 1. <b> clone the repo </b>

```bash
git clone git@github.com:nickagliano/apify-challenge.git
```

### 2. <b>navigate to project and download npm dependencies</b>

```bash
npm install apify --save
```

### 3. <b>execute getEvents.js *(needs to be done before executing the main.js file)*</b>

* this grabs the individual event links from the site 

* the urls are stored using apify's KeyValueStore class in JSON files of the form '1.json', '2.json', etc., where the number is which page the links were found on

```bash
node getEvents.js
```

### 4. <b>execute main.js</b>

this file scrapes all of necessary data from the event URLs found by the getEvents.js file
 
```bash
node main.js
```

