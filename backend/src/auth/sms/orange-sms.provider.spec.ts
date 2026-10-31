import { AppConfig } from '../../config/app-config';
import { OrangeSmsProvider } from './orange-sms.provider';

describe('OrangeSmsProvider', () => {
  const config = new AppConfig({
    NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(32), OTP_SECRET: 'y'.repeat(32),
    SMS_PROVIDER: 'orange', ORANGE_CLIENT_ID: 'id', ORANGE_CLIENT_SECRET: 'secret',
  });
  const calls: { url: string; init: RequestInit }[] = [];
  let sendStatus = 201;

  beforeEach(() => {
    calls.length = 0;
    sendStatus = 201;
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/oauth/v3/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      }
      return new Response('{}', { status: sendStatus });
    }) as unknown as typeof fetch;
  });

  it('gets a token once and sends to every Ivorian number from the country sender', async () => {
    const sms = new OrangeSmsProvider(config);
    await sms.send('+2250544332211', 'Nogoman : votre code est 123456.');
    await sms.send('+2250708123456', 'Nogoman : votre code est 654321.');

    const tokenCalls = calls.filter((c) => c.url.endsWith('/oauth/v3/token'));
    expect(tokenCalls).toHaveLength(1);
    expect((tokenCalls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);

    const send = calls[1];
    expect(send.url).toBe('https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2250000/requests');
    expect((send.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(send.init.body as string)).toEqual({
      outboundSMSMessageRequest: {
        address: 'tel:+2250544332211',
        senderAddress: 'tel:+2250000',
        outboundSMSTextMessage: { message: 'Nogoman : votre code est 123456.' },
      },
    });
  });

  it('reports a refused SMS as SMS_FAILED', async () => {
    sendStatus = 403;
    await expect(new OrangeSmsProvider(config).send('+2250544332211', 'x')).rejects.toMatchObject({
      response: { code: 'SMS_FAILED' },
    });
  });
});
