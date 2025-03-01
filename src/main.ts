import * as core from '@actions/core'
import { Token } from './interfaces.js'
import { getToken, submit_tasks, check_status } from './functions.js'
import { execSync } from 'child_process'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const CLIENT_ID: string = core.getInput('client_id')
    const CLIENT_SECRET: string = core.getInput('client_secret')
    const endpoint_uuid: string = core.getInput('endpoint_uuid')
    const function_uuid: string = core.getInput('function_uuid')

    const args: string = core.getInput('args')
    const kwargs: string = core.getInput('kwargs')

    // install globus-compute-sdk if not already installed
    execSync(
      'gc_installed=$(pip freeze | grep globus-compute-sdk | wc -l) &&' +
        ' if [ ${gc_installed} -lt 1 ]; then pip install globus-compute-sdk; fi;'
    )

    const token: Token = await getToken(CLIENT_ID, CLIENT_SECRET)
    const batch_res = await submit_tasks(
      token.access_token,
      endpoint_uuid,
      function_uuid,
      args,
      kwargs
    )
    const keys: string = Object.keys(batch_res.tasks)[0]
    const task_uuid: string = batch_res.tasks[keys as keyof object][0]
    const response = await check_status(token.access_token, task_uuid)

    core.setOutput('response', response)

    if (response.status === 'success') {
      let data = response.result
      data = data.replace(/\n/g, '\\n')

      const output = execSync(
        `python -c 'import globus_compute_sdk; import json;` +
          ` data = globus_compute_sdk.serialize.concretes.DillDataBase64().deserialize("${data}");` +
          ` print(json.dumps({"stdout": data.stdout, "stderr": data.stderr, "cmd": data.cmd, "returncode": data.returncode})` +
          ` if not isinstance(data, dict) else json.dumps(data).replace("\\n", ""))'`,
        { encoding: 'utf-8' }
      )

      core.setOutput('result', output)

      const output_json = JSON.parse(output)

      if ('stdout' in output_json) {
        if ('returncode' in output_json && output_json['returncode'] != 0) {
          throw Error(output_json['stdout'])
        }
        console.log(output_json['stdout'])
      } else {
        console.log(output_json)
      }
      // json.dumps({"stdout": data.stdout.replace('\\\\n', '\\n'), "stderr": data.stderr, "cmd": data.cmd, "returncode": data.returncode}`
    } else {
      core.setOutput('result', '')
    }
  } catch (error) {
    core.setFailed(error as Error)
  }
}
