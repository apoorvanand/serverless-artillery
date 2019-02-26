# Serverless-artillery [![Build Status](https://travis-ci.org/Nordstrom/serverless-artillery.svg?branch=master)](https://travis-ci.org/Nordstrom/serverless-artillery) [![Coverage Status](https://coveralls.io/repos/github/Nordstrom/serverless-artillery/badge.svg?branch=master)](https://coveralls.io/github/Nordstrom/serverless-artillery?branch=master)

[//]: # (Thanks to https://www.divio.com/en/blog/documentation/)


# Introduction
Combine [`serverless`](https://serverless.com) with [`artillery`](https://artillery.io) and you get `serverless-artillery` (a.k.a. `slsart`). 

Serverless-artillery makes it easy to test your services for load and functionality quickly, with almost no code and without having to maintain any servers or testing infrastructure.

## Use serverless-artillery if
1. You want to know if your services (either internal or public) can handle different amount of traffic load (i.e. performance testing).
1. You want to test if your services behave as you expect after you deploy new changes (i.e. acceptance testing).
1. You want to constantly monitor your services over time to make sure the latency of your services is under control (i.e. monitoring mode).

# Table of Contents
<details><summary>Click to expand/collapse</summary>
<ul>
    <li><a href="#installation">Installation</a></li>
        <ul>
            <li><a href="#prerequisite">Prerequisite</a></li>
            <ul>
                <li><a href="#1-node-js">Node JS</a></li>
                <li><a href="#2-serverless-framework-cli">Serverless Framework CLI</a></li>
            </ul>
            <li><a href="#installing-serverless-artillery">Installing serverless-artillery</a></li>
            <li><a href="#problems-installing">Problems installing?</a></li>
            <ul>
                <li><a href="#error-npm-err-code-eacces">Error: npm ERR! code EACCES</a></li>
                <li><a href="#installing-in-docker">Installing in Docker?</a></li>
            </ul>
        </ul>
    <li><a href="#uninstallation">Uninstallation</a></li>
    <li><a href="#before-running-serverless-artillery">Before running serverless-artillery</a></li>
        <ul>
            <li><a href="#setup-for-nordstrom-technology">Setup for Nordstrom Technology</a></li>
            <li><a href="#setup-for-everyone-else">Setup for everyone else</a></li>
        </ul>
    <li><a href="#run-a-quick-test">Run a quick test</a></li>
    <li><a href="#tutorial">Tutorial</a></li>
</ul>
</details>

# Installation

## Prerequisite
### 1. Node JS
Before installing serverless-artillery, install Node JS from https://nodejs.org/en/download/ or with your operating system’s package manager. You can install the latest LTS version. We support any version higher than maintenance LTS (v6+).
### 2. Serverless Framework CLI
Before installing serverless-artillery, install Serverless Framework CLI (a.k.a. Serverless) (v1.0+). It should be either installed globally or available in the local node_modules. To install globally use the following command.
```
npm install -g serverless
```

## Installing serverless-artillery
Now you can install serverless-artillery using the following command.
```
npm install -g serverless-artillery
```
To check that the installation succeeded, run:
```
slsart --version
```
You should see serverless-artillery print its version if the installation has been successful.

## Problems installing?
**ASHMITODO:Look into this:**
### Error: npm ERR! code EACCES
If you are installing into a node_modules owned by root and getting error `npm ERR! code EACCES`, [read this](root-owns-node-modules.md).
### Installing in Docker?
Post installation causes permission issues when installing in a Docker image. To successfully install in Docker make sure to add the following to your Dockerfile before the serverless and serverless-artillery install. Refer to the [example Dockerfile](Dockerfile).
```
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=$PATH:/home/node/.npm-global/bin
```

# Uninstallation
When needed, you can uninstall serverless-artillery using the following command.
```
npm uninstall -g serverless-artillery
```

# Before running serverless-artillery
**ASHMITODO:Look into this:**
## Setup for Nordstrom Technology
If you are a **_Nordstrom_** engineer, please see the page titled **_`Serverless Artillery - Nordstrom Technology Setup`_** in **Confluence** and follow the instructions there.
## Setup for everyone else
In order to use serverless-artillery, depending on the AWS account environment you're working in, you may need to define `AWS_PROFILE` to declare the AWS credentials to use and possibly `HTTP_PROXY` in order to escape your corporate proxy.  See the [Serverless Framework docs](https://serverless.com/framework/docs/) or the [workshop](https://github.com/Nordstrom/serverless-artillery-workshop) for details of how to set your system up for successful deployment, invocation, and removal. 

# Run a quick test

# Tutorial
Let’s learn by example.

Throughout this tutorial we will walk you towards testing the AWS website, https://aws.amazon.com/.  

Create the initial script you will need by typing the following in your shell:

```
slsart script
```

`slsart script` created script.yml file, if we look at what it contains:

```
# Thank you for trying serverless-artillery!
# This default script is intended to get you started quickly.
# There is a lot more that Artillery can do.
# You can find great documentation of the possibilities at:
# https://artillery.io/docs/
config:
  # this hostname will be used as a prefix for each URI in the flow unless a complete URI is specified
  target: "http://aws.amazon.com"
  phases:
    -
      duration: 5
      arrivalRate: 2
scenarios:
  -
    flow:
      -
        get:
          url: "/"

```

In this script, we specify that we are testing the service running on http://aws.amazon.com which will be talking to over HTTP. We define one load phase, which will last 5 seconds with 2 new virtual users (arriving every second (on average).
For more details on setting up scripts read [Artillery’s documentation](https://artillery.io/docs/script-reference/).

Next you want to deploy your code to aws, and you will need to [set up an AWS account and set up your credentials](https://github.com/Nordstrom/serverless-artillery-workshop/tree/master/Lesson0%20-%20Before%20the%20workshop).

With that done, you are now ready to deploy your script and start the test.

```
slsart deploy //deploys code from your computer to AWS
Slsart invoke /starts the test by creating traffic against the sample endpoint

```

After the test is done, you can remove the project from AWS:

```
slsart remove
```
