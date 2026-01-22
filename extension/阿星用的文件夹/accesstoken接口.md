# 获取Access Token

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/token:
    post:
      summary: 获取Access Token
      deprecated: false
      description: >-
        一：备注说明

        :::highlight purple 💡

        Token使用注意事项：

        开发者需要缓存access_token，用于后续接口的调用（注意：不能频繁调用gettoken接口，否则会受到频率拦截）。当access_token失效或过期时，需要重新获取。

        access_token的有效期通过返回的expires_in来传达，正常情况下为（24小时），有效期内重复获取返回相同结果，过期后获取会返回新的access_token。

        平台可能会出于运营需要，提前使access_token失效，开发者应实现access_token失效时重新获取的逻辑。

        :::
      tags:
        - 公共接口
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                client_secret:
                  type: string
                  title: 授权密码
                client_id:
                  type: string
                  title: 授权客户id
              x-apifox-orders:
                - client_id
                - client_secret
              required:
                - client_id
                - client_secret
            example:
              client_id: Xt0vTn8H9a
              client_secret: 02dbUQSD70PpS6H
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: string
                  message:
                    type: string
                  data:
                    type: object
                    properties:
                      expires:
                        type: string
                        title: 过期时间
                      access_token:
                        type: string
                        title: access_token
                    required:
                      - access_token
                      - expires
                    x-apifox-orders:
                      - access_token
                      - expires
                required:
                  - code
                  - message
                  - data
                x-apifox-orders:
                  - code
                  - message
                  - data
              example:
                code: '200'
                message: success
                data:
                  access_token: 1472FE44-A1EF-B944-70C4-142B3A1C5F8C
                  expires: '2023-11-16 20:20:11'
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 公共接口
      x-apifox-status: developing
      x-run-in-apifox: https://app.apifox.com/web/project/3599320/apis/api-125669084-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```