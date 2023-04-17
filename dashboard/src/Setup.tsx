import { graphql } from '@daed/schemas/gql'
import { Policy } from '@daed/schemas/gql/graphql'
import { Button, Stack, TextField } from '@mui/material'
import { useStore } from '@nanostores/react'
import { request } from 'graphql-request'
import { useSnackbar } from 'notistack'
import { useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  getInterfacesRequest,
  getJsonStorageRequest,
  useCreateConfigMutation,
  useCreateDNSMutation,
  useCreateGroupMutation,
  useCreateRoutingMutation,
  useSetJsonStorageMutation,
} from '~/apis'
import {
  DEFAULT_CONFIG_withInterface,
  DEFAULT_DNS,
  DEFAULT_ENDPOINT_URL_INPUT,
  DEFAULT_ROUTING,
  MODE,
  formatUserInputEndpointURL,
} from '~/constants'
import { SetupContext } from '~/contexts'
import { endpointURLAtom, modeAtom, tokenAtom } from '~/store'

export const Setup = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation()
  const endpointURL = useStore(endpointURLAtom)
  const token = useStore(tokenAtom)
  const mode = useStore(modeAtom)
  const { protocol } = new URL(location.href)
  const setJsonStorage = useSetJsonStorageMutation()
  const createConfigMutation = useCreateConfigMutation()
  const createRoutingMutation = useCreateRoutingMutation()
  const createDNSMutation = useCreateDNSMutation()
  const createGroupMutation = useCreateGroupMutation()

  type FormValues = {
    username: string
    password: string
    endpointURL: string
  }

  const { register, handleSubmit } = useForm<FormValues>({
    shouldUnregister: true,
  })

  const { enqueueSnackbar } = useSnackbar()

  const onSubmit = useCallback(
    async (data: FormValues) => {
      const formattedUserInputEndpointURL = formatUserInputEndpointURL(data.endpointURL)

      let token: string | undefined

      try {
        const { numberUsers } = await request(
          formattedUserInputEndpointURL,
          graphql(`
            query NumberUsers {
              numberUsers
            }
          `)
        )

        if (numberUsers === 0) {
          const { createUser: createUserToken } = await request(
            formattedUserInputEndpointURL,
            graphql(`
              mutation CreateUser($username: String!, $password: String!) {
                createUser(username: $username, password: $password)
              }
            `),
            {
              username: data.username,
              password: data.password,
            }
          )

          token = createUserToken
        } else {
          const { token: loginToken } = await request(
            formattedUserInputEndpointURL,
            graphql(`
              query Token($username: String!, $password: String!) {
                token(username: $username, password: $password)
              }
            `),
            {
              username: data.username,
              password: data.password,
            }
          )

          token = loginToken
        }

        if (token) {
          endpointURLAtom.set(formattedUserInputEndpointURL)
          tokenAtom.set(token)

          const getJsonStorage = getJsonStorageRequest(formattedUserInputEndpointURL, token)
          const getInterfaces = getInterfacesRequest(formattedUserInputEndpointURL, token)
          const [modeResponse, defaultConfigID, defaultRoutingID, defaultDNSID, defaultGroupID] = (
            await getJsonStorage(['mode', 'defaultConfigID', 'defaultRoutingID', 'defaultDNSID', 'defaultGroupID'])
          ).jsonStorage

          if (modeResponse) {
            modeAtom.set(modeResponse as MODE)
          } else {
            await setJsonStorage.mutateAsync({
              mode: MODE.simple,
            })
            modeAtom.set(MODE.simple)
          }
          const interfaceName =
            (await getInterfaces()).general.interfaces.find(({ name }) => name !== 'lo')?.name || 'lan'

          if (!defaultConfigID) {
            const {
              createConfig: { id },
            } = await createConfigMutation.mutateAsync({
              name: 'default',
              global: DEFAULT_CONFIG_withInterface(interfaceName),
            })

            await setJsonStorage.mutateAsync({
              defaultConfigID: id,
            })
          }

          if (!defaultRoutingID) {
            const {
              createRouting: { id },
            } = await createRoutingMutation.mutateAsync({
              name: 'default',
              routing: DEFAULT_ROUTING,
            })

            await setJsonStorage.mutateAsync({
              defaultRoutingID: id,
            })
          }

          if (!defaultDNSID) {
            const {
              createDns: { id },
            } = await createDNSMutation.mutateAsync({
              name: 'default',
              dns: DEFAULT_DNS,
            })

            await setJsonStorage.mutateAsync({
              defaultDNSID: id,
            })
          }

          if (!defaultGroupID) {
            const {
              createGroup: { id },
            } = await createGroupMutation.mutateAsync({
              name: 'default',
              policy: Policy.Min,
              policyParams: [],
            })

            await setJsonStorage.mutateAsync({
              defaultGroupID: id,
            })
          }
        }
      } catch (e) {
        enqueueSnackbar((e as Error).message, {
          variant: 'error',
        })
      }
    },
    [
      createConfigMutation,
      createDNSMutation,
      createGroupMutation,
      createRoutingMutation,
      enqueueSnackbar,
      setJsonStorage,
    ]
  )

  if (!endpointURL || !token) {
    return (
      <Stack minHeight="100dvh" spacing={2} maxWidth={512} mx="auto" alignItems="center" justifyContent="center">
        <TextField fullWidth label={t('username')} {...register('username')} />
        <TextField fullWidth type="password" label={t('password')} {...register('password')} />

        <TextField
          fullWidth
          type="url"
          helperText={t('endpointURL')}
          InputProps={{
            startAdornment: `${protocol}//`,
            endAdornment: '/graphql',
          }}
          placeholder={DEFAULT_ENDPOINT_URL_INPUT}
          {...register('endpointURL')}
        />

        <Button fullWidth variant="contained" onClick={handleSubmit(onSubmit)}>
          {t('actions.login')}
        </Button>
      </Stack>
    )
  }

  return (
    <SetupContext.Provider
      value={{
        token,
        mode,
      }}
    >
      <SetupContext.Consumer>{() => children}</SetupContext.Consumer>
    </SetupContext.Provider>
  )
}
