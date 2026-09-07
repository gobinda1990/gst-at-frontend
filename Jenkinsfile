pipeline {
    agent any 
    environment {
        SONARQUBE_SERVER = 'sonar'
        SONAR_HOST_URL   = 'http://10.153.43.8:9000'
        SCANNER_HOME = tool 'sonar-scanner' 
        SONAR_PROJECT_KEY = 'wb-impact-dashboard'
        SONAR_PROJECT_NAME = 'wb-impact-dashboard'
        IMAGE_NAME = 'wb-impact-dashboard'
        IMAGE_TAG  = "${BUILD_NUMBER}"
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out wb-impact-dashboard repository...'
                git branch: 'main',
                    url: 'https://github.com/gobinda1990/wb-impact-dashboard.git'
            }
        }

        stage('SonarQube Analysis - React') {
    steps {
        echo "Running SonarQube analysis for React application..."
        withSonarQubeEnv("${SONARQUBE_SERVER}") {
            withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {              
                    sh '''
                        echo "SCANNER_HOME = $SCANNER_HOME"
                        ls -l ${SCANNER_HOME}/bin/
                        ${SCANNER_HOME}/bin/sonar-scanner \
                          -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                          -Dsonar.projectName="${SONAR_PROJECT_NAME}" \
                          -Dsonar.sources=src \
                          -Dsonar.exclusions=node_modules/**,dist/**,build/** \
                          -Dsonar.language=js \
                          -Dsonar.sourceEncoding=UTF-8 \
                          -Dsonar.host.url=$SONAR_HOST_URL \
                          -Dsonar.login=$SONAR_TOKEN
                    '''              
            }
        }
    }
}

        stage('Build Docker Image') {
            steps {
                echo 'Building Docker image for Vite app...'
                sh """
                    docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .
                    docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:latest
                """
            }
        }

        stage('Deploy Locally') {
            steps {
                echo 'Deploying wb-impact-dashboard locally...'
                sh """
                    docker stop ${IMAGE_NAME} || true
                    docker rm ${IMAGE_NAME} || true

                    docker run -d \
                      --name ${IMAGE_NAME} \
                      -p 8084:80 \
                      --restart unless-stopped \
                      ${IMAGE_NAME}:latest
                """
            }
        }
    }

    post {
        always {
            echo 'Cleaning workspace...'
            cleanWs()
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
}
