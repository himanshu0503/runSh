#!/bin/bash -e

export RES_REPO=runSh-repo

export RES_MICRO_IMAGE=microbase-img

export HUB_REGION=us-east-1
export HUB_LOC=374168611083.dkr.ecr.$HUB_REGION.amazonaws.com
export RES_HUB_CREDS=shipbits-ecr

export DEF_IMAGE_NAME=runsh
export DEF_IMAGE_TAG=latest
export RES_IMAGE=runSh-img

findUpstreamMicroBaseVersion() {
  echo "Find Latest Version for" $RES_MICRO_IMAGE
  export versionName=$(cat ./IN/$RES_MICRO_IMAGE/version.json | jq -r '.version.versionName')
  echo "Completed find Latest Version for" $RES_MICRO_IMAGE
}

configure_aws() {
  creds_path="./IN/$RES_HUB_CREDS/integration.env"
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
  echo "Starting Docker build for" $HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG
  cd ./IN/$RES_REPO/gitRepo
  sed -i "s/{{%TAG%}}/$versionName/g" Dockerfile
  sudo docker build -t=$HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG .
  echo "Completed Docker build for" $HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG
}

delete_untagged_images() {
  echo "Starting deleting of untagged images"
  aws ecr list-images --repository-name $DEF_IMAGE_NAME --query 'imageIds[?type(imageTag)!=`string`].[imageDigest]' --output text | while read line; do aws ecr batch-delete-image --repository-name $DEF_IMAGE_NAME --image-ids imageDigest=$line; done
  echo "Completed deleting all untagged images"
}

ecrPush() {
  echo "Starting Docker push for" $HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG
  sudo docker push $HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG
  echo "Completed Docker push for" $HUB_LOC/$DEF_IMAGE_NAME:$DEF_IMAGE_TAG
}

createOutState() {
  echo "Creating a state file for" $RES_IMAGE
  echo versionName=$DEF_IMAGE_TAG > /build/state/$RES_IMAGE.env
  echo "Completed creating a state file for" $RES_IMAGE
}

main() {
  findUpstreamMicroBaseVersion
  configure_aws
  ecr_login
  dockerBuild
  delete_untagged_images
  ecrPush
  createOutState
}

main
