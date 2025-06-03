pipeline {
  agent any

  stages {
    stage('Clone Code') {
      steps {
        git 'https://github.com/your-username/your-repo.git' // 🔁 Replace with your actual repo
      }
    }

    stage('Build Docker Images') {
      steps {
        sh 'docker-compose build'
      }
    }

    stage('Run Containers') {
      steps {
        sh 'docker-compose up -d'
      }
    }
  }
}
