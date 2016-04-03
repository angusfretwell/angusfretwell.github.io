---
layout: post
title:  Deploying a Craft CMS site with Dokku
date:   2016-04-03
categories: craft dokku
comments: true
---

[Dokku](http://dokku.viewdocs.io/dokku/) is an Heroku-like PaaS based on Docker. You can use it to quickly and simply deploy apps to your own VPS, making it far more economical than Heroku, with little added overhead.

Deployments are performed by creating a git remote (dokku@your-dokku-server:app-name) and pushing to it. [Buildstep](https://github.com/progrium/buildstep), a component of Dokku, determines the language and framework used by your application by looking for common files or patterns. For example, a package.json file in the root of a repository suggests a node.js app, while composer.json or index.php suggest a PHP one.

Once the language has been detected, Dokku creates a generic environment for that language inside a Docker container, and performs conventional tasks such as running `composer install`. Once the build process is complete, the Docker container is exposed at +http://app-name.your-dokku-server.

[Plugins](http://dokku.viewdocs.io/dokku/plugins/) allow the creation of external services like MySQL. By "linking" a MySQL container to an app, Dokku exposes a `DATABASE_URL` environment variable which it can use to connect to the database.

## Provisioning the server

If it's your first time using Dokku, I recommend leveraging DigitalOcean's 1-click application image. You can follow this [referral link](https://m.do.co/c/0f2de4005c74) for $10 credit.

Otherwise, you can install the latest stable release on a Debian-based system with the following commands:

```shell
wget https://raw.githubusercontent.com/dokku/dokku/v0.5.3/bootstrap.sh
sudo DOKKU_TAG=v0.5.3 bash bootstrap.sh
```

Note that your server should have at least 1GB RAM for Dokku to function properly. Although not ideal, you can get it running on a machine with less RAM by [creating a swapfile](http://dokku.viewdocs.io/dokku/advanced-installation/#vms-with-less-than-1gb-of-memory).

Once the installation is complete, you can visit your server's IP address or domain in a web browser to upload an SSH key. If you've configured a domain for your server, I recommend enabling virtualhost naming.

For more in-depth instructions on getting set up, see [Getting Started with Dokku](http://dokku.viewdocs.io/dokku/installation/) or [How to Use the DigitalOcean Dokku Application](https://www.digitalocean.com/community/tutorials/how-to-use-the-digitalocean-dokku-application).

## Preparing the Craft installation

Before we can deploy our Craft site with Dokku, there's a few changes we'll need to make. Note that I'm assuming you have a fairly generic setup, with a /craft directory containing the application and your templates, and a /public directory containing the index.php and .htaccess files. If this isn't the case, you should be able to appropriate the following steps for your project's structure.

Firstly, we need to tell Buildstep to install some PHP extensions that are required by Craft. This is done by creating a composer.json file in the root of the repository. We'll also specify a PHP version to use:

```json
{
  "require": {
    "php": "^5.6.0",
    "ext-mbstring": "*",
    "ext-imagick": "*"
  }
}
```

The PHP buildpack also required that you have a composer.lock file, so let's generate one by running ` composer update  --no-autoloader --ignore-platform-reqs`. Feel free to delete the /vendor directory created by Composer, as we only need the composer.lock file.

Next up, we create a Procfile to tell Apache where to serve from; this should, of course be our /public directory (or whichever directory contains index.php):

```
web: vendor/bin/heroku-php-apache2 public/
```

Lastly, add a .gitkeep file to /craft/storage, to ensure the directory exists after the site is deployed.

### Caveats

Because the Docker container which will be created for our app has an ephemeral filesystem (meaning that files will not be persisted between deployments), there are a few considerations we should have in mind:

1. It's wise to disable Craft's automatic updates. This will also prevent the deployed installation getting out-of-sync with the one in version control. You can disable automatic updates by setting [`allowAutoUpdates`](https://craftcms.com/docs/config-settings#allowAutoUpdates) to `false` in craft/config/general.php.
2. We won't be able to use Craft's default local assets, and will need to use S3, or any of the other asset stores Craft supports to ensure uploads aren't lost between deployments.

## Deploying the Craft site

Now that we're all set up, you can configure a git remote for your server by running `git remote add dokku dokku@your-dokku-server:app-name`, replacing "your-dokku-server" with the domain or IP address of your server, and "app-name" with a slug for your application. Next, run `git push dokku master` to deploy your site.

If everything worked, you will see Dokku bootstrapping the application, installing packages, and deploying and then releasing your site.

![Screenshot of Dokku's build process](/assets/dokku-build.png)

## Setting up and syncing MySQL

If you visit the URL at the end of Dokku's output, you'll be greeted by **Service Unavailable**. If you add /admin to the end of the URL, you'll discover that Craft is unable to connect to a database. So, let's set up MySQL.

Connect to your server via SSH as root, and run `dokku plugin:install https://github.com/dokku/dokku-mysql.git mysql` to install the MySQL plugin. Now we can create a database and link it to our app; since Craft is not compatible with MySQL 5.7, we'll need to tell the plugin to use 5.6 instead (replace `craft-dokku-example` with the name of your app):

```shell
export MYSQL_IMAGE_VERSION="5.6"
docker pull mysql:5.6
dokku mysql:create craft-dokku-example
dokku mysql:link craft-dokku-example craft-dokku-example
```

Now, the next time we deploy our site, it will have access to the MySQL instance we created, and have the URL exposed through the `DATABASE_URL` environment variable. Let's configure Craft to use this database by updating /craft/config/db.php:

```php
<?php

$databaseUrl = parse_url(getenv('DATABASE_URL'));

return array(
  'server' => $databaseUrl['host'],
  'port' => $databaseUrl['port'],
  'user' => $databaseUrl['user'],
  'password' => $databaseUrl['pass'],
  'database' => substr($databaseUrl['path'], 1),
  'tablePrefix' => 'craft'
);
```

Redeploy the site with another `git push dokku master`, and visit the admin URL of the deployed site; you'll now see the Craft installation wizard. That's great, but perhaps you already have Craft installed locally in a Vagrant machine or otherwise, or maybe you have an SQL dump you'd like to import to your deployed site. Dokku allows us to run commands on our server remotely using SSH, without logging in as the root user. For example, try running `ssh dokku@your-dokku-server apps`, which will output a listing of apps deployed to the server.

Run `ssh dokku@your-dokku-server help | grep mysql` to see the commands available for the MySQL plugin. We can use the `mysql:import command`, pipe into it the output of a `mysqldump` or the contents of an .sql file, for example:

```shell
mysqldump -uroot your-local-db | ssh dokku@your-dokku-server mysql:import

# Using a file
cat your-local-db.sql | ssh dokku@your-dokku-server mysql:import
```

Similarly, you can synchronize your local database with the one of your deployed application using `mysql:export`, and piping it into your local database:

```shell
ssh dokku@your-dokku-server mysql:import craft-dokku-example | mysql -uroot your-local-db

# Output to a file
ssh dokku@your-dokku-server mysql:export craft-dokku-example > remote-db.sql
```

After importing a database to your deployed application, you're done!

![Screenshot of deployed site](/assets/deployed-site.png)

## Building front-end assets

Often, your projects will employ a task runner like Gulp or Grunt to compile your front-end assets, and package managers such as Bower and npm to pull in dependencies. While we could simply check in the compiled assets to version control, this isn't ideal and can lead to merge conflicts other problems.

We can have Dokku install dependencies and run build tools for us. To do this, we'll need to tell Dokku to use multiple buildpacks. In addition to the PHP buildpack, we'll use the node.js buildpack, which will install node and run `npm install`.

Create a .buildpacks file in the root of your repository containing the following:

```
https://github.com/heroku/heroku-buildpack-nodejs.git#v89
https://github.com/heroku/heroku-buildpack-php.git#v99
```

Next, add a post-install script to your package.json (this script will run `bower install` and `gulp` after dependencies have been installed), also ensure you're specifying a reasonable semver range for the version of node that should be used:

```json
"engines": {
  "node": "~0.12.7"
},
"scripts": {
  "postinstall": "bower install && gulp"
}
```

The next time you deploy, Dokku will install your npm and Bower dependencies, and compile your front-end assets; it'll also cache node modules and bower components, so that future deployments will be faster.

## Next steps

Once you've grasped the basics, you should explore Dokku's more advanced functionality, such as [zero-downtime deploys](http://dokku.viewdocs.io/dokku/checks-examples/), and plugins like [Let's Encrypt](https://github.com/dokku/dokku-letsencrypt) and [Slack notifications](https://github.com/ribot/dokku-slack).

If I've missed anything, [let me know](mailto:{{site.email}}) or [send a pull request](https://github.com/angusfretwell/angusfretwell.github.io/fork). Have fun!
