pipeline {
    agent {
        node {
            label 'ROBOSHOP'
        }
    }
    parameters {
        string(name: 'NAMESPACE', defaultValue: 'roboshop-dev', description: 'K8s namespace the target catalogue deployment lives in')
        string(name: 'COMMIT_ID', defaultValue: '', description: 'Commit SHA of the catalogue build under test (for traceability)')
    }
    options {
        disableConcurrentBuilds()
        timeout(time: 15, unit: 'MINUTES')
    }
    stages {
        stage('install-dependencies') {
            steps {
                sh 'npm install'
            }
        }
        stage('resolve-catalogue-endpoint') {
            steps {
                script {
                    withAWS(credentials: 'aws-creds', region: 'us-east-1') {
                        sh "aws eks update-kubeconfig --name roboshop-dev --region us-east-1"
                        def podIp = sh(
                            script: "kubectl get pods -n ${params.NAMESPACE} -l project=roboshop,tier=backend,component=catalogue -o jsonpath='{.items[0].status.podIP}'",
                            returnStdout: true
                        ).trim()
                        if (!podIp) {
                            error("No running catalogue pod found in namespace ${params.NAMESPACE}")
                        }
                        env.CATALOGUE_URL = "http://${podIp}:8080"
                        echo "Testing against catalogue pod at ${env.CATALOGUE_URL}"
                    }
                }
            }
        }
        stage('api-tests') {
            steps {
                sh 'npm test'
            }
        }
    }
    post {
        always {
            junit testResults: 'junit.xml', allowEmptyResults: true
            archiveArtifacts artifacts: 'junit.xml', allowEmptyArchive: true
        }
        success {
            echo "catalogue-api-tests passed against ${params.NAMESPACE} (commit ${params.COMMIT_ID})"
        }
        failure {
            echo "catalogue-api-tests failed against ${params.NAMESPACE} (commit ${params.COMMIT_ID}) — see junit report"
        }
    }
}
