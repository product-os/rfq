#!/usr/bin/env node

'use strict';

const capitano = require('capitano')
const JSZip = require('node-zip')
const zip = new JSZip()
const fs = require('fs')
const skhema = require('skhema')
const { join } = require('path')
const _ = require('lodash')
const readJson = async (path) => {
  return JSON.parse(fs.readFileSync(path))
}

const generate = async (params, options) => {
  const path = params.path
  const config = await readJson(join(path, 'source', 'specification', 'spec.json'))
  const manufacturer = options['manufacturer'].toLowerCase()
  const proc = options['process'].toLowerCase()
  const outputPath = options['output'] || path

  const opts = await validateAndParse(path, manufacturer, proc, config)
  return buildRFQ(outputPath, manufacturer, proc, opts)
}

const buildRFQ = async (outPath, manufacturer, proc, opts) => {
  // For each part in opts we add a correseponding file to the zip archive
  const output = _.map(opts, (part) => {
    const fileContent = Buffer.from(part.parameters.file, 'base64').toString('utf8')
    zip.file(`${part.name}${part.parameters['file-type']}`, fileContent)
    return {
      name: part.name,
      parameters: _.omit(part.parameters, ['file', 'file-type'])
    }
  })

  // Now we add the rfq.json
  zip.file('rfq.json', JSON.stringify(output, null, 2))

  // Generate and write zip file
  const data = zip.generate({
    base64: false,
    compression: 'DEFLATE'
  })

  fs.writeFileSync(join(outPath, `${manufacturer}-${proc}.zip`), data, 'binary')
}

const validateAndParse = async (path, manufacturer, proc, config) => {
  const schema = await readJson(join(__dirname, 'manufacturers', manufacturer, proc, 'rfq.json'))
  return Promise.all(_.map(config.manufacture, async (part) => {
    const transformedPart = await transformPart(path, part)
    if (!transformedPart.processes.includes(proc)) {
      throw new Error(`${proc} is not a valid process for ${transformedPart.name}`)
    }
    const partRFQ = skhema.filter(schema, transformedPart.parameters)

    return {
      name: transformedPart.name,
      parameters: partRFQ
    }
  }))
}

const transformPart = async (path, part) => {
  const file = fs.readFileSync(join(path, 'outputs', 'STEP', `${part.name}.step`))
  return {
    ...part,
    parameters: {
      ...part.parameters,

      file: file.toString('base64'),
      // TODO: Generate this based on the manufacturer/proc pair
      'file-type': '.step'
    },
    processes: part.processes.map(_.lowerCase)
  }
}

capitano.command({
  signature: 'generate <path>',
  description: 'Generate a target-specific RFQ from a repository',
  options: [
    {
      signature: 'output',
      parameter: 'output',
      alias: ['o'],
      description: 'Output directory, defaults to path if not specified',
    }, {
      signature: 'manufacturer',
      parameter: 'manufacturer',
      alias: ['m'],
      required: true,
      description: 'Target manufacturer to generate RFQ for',
    }, {
      signature: 'process',
      parameter: 'process',
      alias: ['p'],
      required: true,
      description: 'Process type, depends on the choice of manufacturer',
    }
  ],
  action: generate
})

capitano.run(process.argv, err => {
  if (err != null) {
    throw err
  }
})
