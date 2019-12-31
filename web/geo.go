package web

import (
	"github.com/oschwald/maxminddb-golang"
	"log"
	"net"
)

var db *maxminddb.Reader

func LookupCountry(ip string) string {
	var record geoDBRecord
	err := geoDB().Lookup(net.ParseIP(ip), &record)
	if err != nil {
		log.Println("Failed to lookup IP", err.Error())
	}
	return record.Country.ISOCode
}

func geoDB() *maxminddb.Reader {
	if db == nil {
		var err error
		db, err = maxminddb.Open("geo/GeoLite2-Country.mmdb")
		if err != nil {
			log.Fatal(err)
		}
	}

	return db
}

type geoDBRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
}
