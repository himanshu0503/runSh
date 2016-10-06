#!/bin/bash -e

export RES_REPO=runSh-repo
export BRANCH=master

export RES_MICRO_IMAGE=microbase-img

export RES_OLD_HUB_CREDS=docker-creds
export OLD_IMAGE_NAME=shipimg/runsh
export OLD_IMAGE_TAG=$BRANCH.$BUILD_NUMBER
export RES_OLD_IMAGE=runSh-img

export HUB_REGION=us-east-1
export HUB_LOC=374168611083.dkr.ecr.$HUB_REGION.amazonaws.com
export RES_DEF_HUB_CREDS=shipbits-ecr

export DEF_IMAGE_NAME=runsh
export DEF_IMAGE_TAG=latest
export RES_DEF_IMAGE=runSh-def-img

findUpstreamMicroBaseVersion() {
  echo "Find Latest Version for" $RES_MICRO_IMAGE
  export versionName=$(cat ./IN/$RES_MICRO_IMAGE/version.json | jq -r '.version.versionName')
  echo "Completed find Latest Version for" $RES_MICRO_IMAGE
}

dockerLogin() {
  echo "Extracting docker creds"
  . ./IN/$RES_OLD_HUB_CREDS/integration.env
  echo "logging into Docker with username" $username
  docker login -u $username -p $password -e $email
  echo "Completed Docker login"
}

configure_aws() {
  creds_path="./IN/$RES_DEF_HUB_CREDS/integration.env"
  if [ ! -e $creds_path ]; then
    echo "No credentials file found at location: $creds_path"
    return 1
  fi
  echo "Extracting ECR credentials"
  . $creds_path
  echo "Configuring aws cli with ECR credentials"
  aws configure set aws_access_key_id $aws_access_key_id
  aws configure set aws_secret_access_key $aws_secret_access_key
  aws configure set region $HUB_REGION
  echo "Successfully configured aws cli credentials"
}

ecr_login() {
  echo "logging in to Amazon ECR"
  docker_login_cmd=$(aws ecr get-login --region $HUB_REGION)
  $docker_login_cmd > /dev/null 2>&1
  echo "Amazon ECR login complete"
}

dockerBuild() {
  echo "Starting Docker build for" $OLD_IMAGE_NAME:$OLD_IMAGE_TAG
  cd ./IN/$RES_REPO/gitRepo
  sed -i "s/{{%TAG%}}/$versionName/g" Dockerfile
  sudo docker build -t=$OLD_IMAGE_NAME:$OLD_IMAGE_TAG .
  echo "Completed Docker build for" $OLD_IMAGE_NAME:$OLD_IMAGE_TAG
}

dockerPush() {
  echo "Starting Docker push for" $OLD_IMAGE_NAME:$OLD_IMAGE_TAG
  sudo docker push $OLD_IMAGE_NAME:$OLD_IMAGE_TAG
  echo "Completed Docker push for" $OLD_IMAGE_NAME:$OLD_IMAGE_TAG
}

ecrPush() {
  sudo docker tag -f $OLD_IMAGE_NAME:$OLD_IMAGE_TAG $HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG
  echo "Starting Docker push for" $HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG
  sudo docker push $HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG
  echo "Completed Docker push for" $HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG
}

createOutState() {
  echo "Creating a state file for" $RES_OLD_IMAGE
  echo versionName=$OLD_IMAGE_TAG > /build/state/$RES_OLD_IMAGE.env
  echo "Completed creating a state file for" $RES_OLD_IMAGE

  echo "Creating a state file for" $RES_DEF_IMAGE
  echo versionName=$DEF_IMAGE_TAG > /build/state/$RES_DEF_IMAGE.env
  echo "Completed creating a state file for" $RES_DEF_IMAGE
}

main() {
  findUpstreamMicroBaseVersion
  dockerLogin        #do not change the order of this exec. relative path issue
  configure_aws
  ecr_login
  dockerBuild
  dockerPush
  ecrPush
  createOutState
}

main
