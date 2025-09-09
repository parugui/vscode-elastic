## Elasticsearch for VSCode

[![.github/workflows/runTests.yaml](/../../actions/workflows/runTests.yaml/badge.svg)](/../../actions/workflows/runTests.yaml)
[![.github/workflows/publish.yaml](/../../actions/workflows/publish.yaml/badge.svg)](/../../actions/workflows/publish.yaml)
Welcome to **Elasticsearch for VSCode**, the definitive extension for developers who work with **Elasticsearch queries** directly within Visual Studio Code. Streamline your workflow, execute queries intuitively, and manage multiple environments with ease.

![shot](shots/all.gif)

## Getting Started

1.  **Installation**: Install the extension from the **Visual Studio Code Marketplace**.
2.  **Language Mode**: Create a new file with the `.es` extension, or in an existing text file, change the language mode to `Elasticsearch (es)`. To do this, press `Ctrl+K, M` and select `Elasticsearch (es)`.
3.  **Environment Setup**: Configure one or more environments in your **`settings.json`** file. This allows you to easily switch between different clusters (e.g., development, production).


## How to Use

-   Open an existing file with a `.es` file extenion or open a new text file (`ctrl+n`) and change the language mode to `Elasticsearch (es)` by pressing `ctrl+k,m` and select `es`. Elasticsearch queries and funtionalities are enabled in the es language mode in Visual Studio Code editor.
-   Configure one or more environments.
-   Select the active environment.
-   For https endpoints, just add protocol type in url : `https://host`
-   For auth protected clusters, you can use `http://user:pass@host:9200` as the endpoint url to have it auth.
-   For cases where Elasticsearch is not directly exposed and must be accessed through an API Gateway, you can use extraHeaders to pass authentication keys such as X-API-Key or equivalent.

### Submitting Queries

Simply write your query and press **`Alt + Enter`** or **`Ctrl + Enter`** to execute it. The extension supports executing single or multiple queries.

```text
GET /my-index/_search
{
    "size":7,
    "query": {
        "match" : {
            "message" : {
                "query" : "this is a test"
            }
        }
    }
}
```

Get payload from file [[#4](https://github.com/hsen-dev/vscode-elastic/issues/4)]:

```text
PUT /my-index
!./opt/elasticsearch/mapping.json
```

## Commands

-   **Elastic: Configure Environments** – define multiple environments in settings.
-   **Elastic: Change Environment** – select the current active environment.

## Keymaps

-   **Alt + Enter** / **Ctrl + Enter** to execute selected query.

## Roadmap

-   Work with multi host
-   User Authentication
-   IntelliSense like kibana autocomplete
-   Show verbose logs
-   Add extra headers

## New Features

### Verbose Logs
You can now enable detailed logging for debugging purposes.  
This is controlled via the setting:

```json
"elastic.showVerboseLogs": true

### Environment Configuration

The extension provides full flexibility in configuring your environments. You can define multiple hosts, authentication methods, and custom headers for each one.
Configure multiple environments (e.g., dev, prd, tst) in your settings.json file.

```json
"elastic.environments": {
  "dev": {
    "host": "https://dev-api.mycompany.com",
    "extraHeaders": { "X-API-Key": "dev-key" }
  },
  "prd": {
    "host": "https://prd-api.mycompany.com",
    "extraHeaders": { "X-API-Key": "prd-key" }
  }, 
  "tst": {
    "host": "https://tst-api.mycompany.com",
    "extraHeaders": { "Authorization": "Bearer changeme" }
  }
}

### Select Current Environment

To switch between environments, use the **Elastic: Change Environment** command or click the environment name in the Status Bar.

The selected environment is shown in the Status Bar and can be switched with a single click.

If no environment is configured or selected, the extension will show a warning and suggest:

-   Elastic: Configure Environments
-   Elastic: Change Environment

