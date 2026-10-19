import { BadRequestException, Controller, Get, Global, Inject, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsString, Length } from 'class-validator';
import { AppConfig } from '../config/app-config';
import { GEOCODER, Geocoder, NoGeocoder } from './geocoder';
import { NominatimGeocoder } from './nominatim.geocoder';

class SearchDto {
  @IsString() @Length(2, 120) q: string;
}

class ReverseDto {
  @Type(() => Number) @IsLatitude() lat: number;
  @Type(() => Number) @IsLongitude() lng: number;
}

@ApiTags('geo')
@ApiBearerAuth()
@Controller('geo')
export class GeoController {
  constructor(@Inject(GEOCODER) private readonly geocoder: Geocoder) {}

  /** Address search for the "where is the farm" step. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('search')
  search(@Query() q: SearchDto) {
    return this.geocoder.search(q.q.trim());
  }

  /** Names a GPS position ("Étampes", "Daloa"...). 404-like null when nothing is found. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('reverse')
  async reverse(@Query() q: ReverseDto) {
    const place = await this.geocoder.reverse(q.lat, q.lng);
    if (!place) throw new BadRequestException({ code: 'PLACE_NOT_FOUND', message: 'Lieu introuvable. Cherchez une adresse.' });
    return place;
  }
}

@Global()
@Module({
  controllers: [GeoController],
  providers: [{
    provide: GEOCODER,
    inject: [AppConfig],
    useFactory: (config: AppConfig): Geocoder =>
      config.geocoder === 'nominatim'
        ? new NominatimGeocoder(config.nominatimUrl, config.geocoderUserAgent, config.geocodeCountries)
        : new NoGeocoder(),
  }],
  exports: [GEOCODER],
})
export class GeoModule {}
