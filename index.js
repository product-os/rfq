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
  //const hwType = options['hwType'].toLowerCase()
  const hwType = config.hwType.toLowerCase();
  const outputPath = options['output'] || path
  const testFile = fs.readFileSync(join(path, 'testing', 'Testing.md'))
  const opts = await validateAndParse(path, hwType, config)
  return buildRFQ(outputPath, hwType, opts, testFile)
}

const buildRFQ = async (outPath, hwType, opts, testFile) => {
  // For each part in opts we add the correseponding files to the zip archive
  const output = _.map(opts, (part) => {
    const fileZip = _.map(part.parameters.files, (file) => {
      const fileContent = Buffer.from(file.file, 'base64').toString('utf8')
      zip.file(`${part.name}${file['file-type']}`, fileContent)
    })
    return {
      name: part.name,
      parameters: _.omit(part.parameters, ["files"])
    }
  })

  //have to add the test file - will it always be the same folder?
  const testContent = Buffer.from(testFile, 'base64').toString('utf8')
  zip.file('Testing.md', testContent)

  // Now we add the rfq.json
  zip.file('rfq.json', JSON.stringify(output, null, 2))

  
  // Generate and write zip file
  const data = zip.generate({
    base64: false,
    compression: 'DEFLATE'
  })

  fs.writeFileSync(join(outPath, `${hwType}.zip`), data, 'binary')
}

const validateAndParse = async (path, hwType, config) => {
  const schema = await readJson(join(__dirname, 'hardware-types', hwType, 'rfq.json'))
  const fileTypes = await readJson(join(__dirname, 'hardware-types', hwType, 'fileTypes.json'))
  return Promise.all(_.map(config.manufacture, async (part) => {
    const transformedPart = await transformPart1(path, part, fileTypes)
    //if (!transformedPart.processes.includes(proc)) {
    //  throw new Error(`${proc} is not a valid process for ${transformedPart.name}`)
    //}

    const partRFQ = skhema.filter(schema, transformedPart.parameters)

    return {
      name: transformedPart.name,
      parameters: transformedPart.parameters
    }
  }))
}

//this will vary depending on project type - e.g PCB won't have step files
const transformPart = async (path, part) => {
  const file = fs.readFileSync(join(path, 'outputs', 'STEP', `${part.name}.step`))
  return {
    ...part,
    parameters: {
      ...part.parameters,

      files: file.toString('base64'),
      // TODO: Generate this based on the project type - for 2d give step and stl, in sub folder
      'file-type': '.step'
    },
    processes: part.processes.map(_.lowerCase)
  }
}

const transformPart1 = async (path, part, fileTypes) => {
  return{
    ...part,
    parameters: {
      ...part.parameters,

      files: _.map(fileTypes.fileTypes, (ext) => {  
        const fileRead = fs.readFileSync(join(path, 'outputs', `${ext}`, `${part.name}` +'.' + ext))
        const fileType = '.'+ ext
        return{
          file : fileRead.toString('base64'),
          
          'file-type' : fileType.toString('base64')
        }
      })
    },
    //processes: part.processes.map(_.lowerCase)
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
    }
  ],
  action: generate
})

capitano.run(process.argv, err => {
  if (err != null) {
    throw err
  }
})
